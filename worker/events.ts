// 埋点解析与写入：页面发来的匿名事件归一后写入 Workers Analytics Engine，不存 IP 与 UA 原文。

interface DataPoint {indexes: string[]; blobs: string[]; doubles: number[]}
export interface Env {ASSETS:{fetch(request:Request):Promise<Response>|Response};SITE_EVENTS:{writeDataPoint(point:DataPoint):void};EVENT_LIMIT?:{limit(options:{key:string}):Promise<{success:boolean}>}}
export type EdgeRequest = Request & {cf?: {country?: string}};

export const EVENT_PATH = '/api/event';
const EVENTS = new Set(['pageview', 'lang_switch', 'download', 'platform', 'mac_help', 'faq']);
const PAGES = new Set(['/', '/en/', '/copyright/', '/en/copyright/']);
const PAGE_LANGS = new Set(['zh-CN', 'en']);
const MAX_BODY = 2048;

// 数据集列顺序。查询脚本按同一顺序给列起名，新增维度只能追加到末尾。
export const BLOBS = ['event', 'page_lang', 'path', 'pref_lang', 'pref_langs', 'country', 'browser', 'browser_version',
  'os', 'os_version', 'device', 'referrer', 'detail', 'arch', 'utm_source'] as const;

const clip = (value: unknown, pattern: RegExp, fallback = '') => {
  const text = typeof value === 'string' ? value.trim() : '';
  return pattern.test(text) ? text : fallback;
};

// 语言标签只取主语言加地区，例如 zh-CN、en-US、ja；脚本、变体与权重都不保留。
export function languageTag(tag: string) {
  const [language, ...rest] = tag.trim().split(/[-_]/);
  if (!/^[a-z]{2,3}$/i.test(language ?? '')) return '';
  const region = rest.find(part => /^([a-z]{2}|\d{3})$/i.test(part));
  return language.toLowerCase() + (region ? '-' + region.toUpperCase() : '');
}

// Accept-Language 按 q 值排序：首选语言完整保留地区，前三种语言只记主语言，用来看访客还能读什么。
export function preferredLanguages(header: string | null) {
  const entries = String(header ?? '').split(',').slice(0, 12).map((part, order) => {
    const [tag, ...params] = part.split(';');
    const q = Number(params.map(p => p.trim()).find(p => p.startsWith('q='))?.slice(2) ?? 1);
    return {tag: languageTag(tag ?? ''), q: Number.isFinite(q) ? q : 0, order};
  }).filter(entry => entry.tag && entry.q > 0).sort((a, b) => b.q - a.q || a.order - b.order);
  const primary = [...new Set(entries.map(entry => entry.tag.split('-')[0]))].slice(0, 3);
  return {preferred: entries[0]?.tag ?? '', languages: primary.join(',')};
}

const major = (ua: string, pattern: RegExp) => ua.match(pattern)?.[1] ?? '';

// 只保留浏览器族、系统族和主版本，不存 UA 原文。App 内置浏览器先于内核判断，版本取 App 自身的。
export function userAgentSummary(ua: string) {
  let browser = 'other', browserVersion = '';
  for (const [name, pattern] of [
    ['X', /\bTwitter(?: for (?:iPhone|iPad)\/(\d+)|Android)/], ['WeChat', /\bMicroMessenger\/(\d+)/], ['QQ', /\b(?:QQ|MQQBrowser)\/(\d+)/],
    ['Edge', /\bEdg(?:e|A|iOS)?\/(\d+)/], ['Opera', /\bOPR\/(\d+)/], ['Samsung Internet', /\bSamsungBrowser\/(\d+)/],
    ['Firefox', /\b(?:Firefox|FxiOS)\/(\d+)/], ['Chrome', /\b(?:Chrome|CriOS)\/(\d+)/], ['Safari', /\bVersion\/(\d+)[\d.]* (?:Mobile\/\S+ )?Safari\//],
    ['iOS WebView', /\((?:iPhone|iPad|iPod);.*AppleWebKit\/[\d.]+ \(KHTML, like Gecko\) Mobile\/\w+$/],
  ] as const) {
    const match = ua.match(pattern);
    if (match) {browser = name; browserVersion = match[1] ?? ''; break}
  }
  let os = 'other', osVersion = '';
  if (/Windows NT/.test(ua)) {os = 'Windows'; osVersion = major(ua, /Windows NT (\d+\.\d+)/) === '10.0' ? '10+' : major(ua, /Windows NT (\d+\.\d+)/)}
  else if (/iPhone|iPad|iPod/.test(ua)) {os = /iPad/.test(ua) ? 'iPadOS' : 'iOS'; osVersion = major(ua, /OS (\d+)_/)}
  else if (/Android/.test(ua)) {os = 'Android'; osVersion = major(ua, /Android (\d+)/)}
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Mac OS X/.test(ua)) {
    os = 'macOS';
    // 主流浏览器把 macOS 版本冻结为 10.15.7，只有更早的系统会报出真实版本。
    const version = ua.match(/Mac OS X (\d+)[_.](\d+)/);
    osVersion = !version ? '' : version[1] === '10' && Number(version[2]) >= 15 ? '10.15+' : version[1] === '10' ? `10.${version[2]}` : version[1];
  }
  else if (/Linux/.test(ua)) os = 'Linux';
  const device = /iPad|Tablet|PlayBook|Silk/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua)) ? 'tablet'
    : /Mobi|iPhone|iPod|Android/.test(ua) ? 'mobile' : 'desktop';
  return {browser, browserVersion, os, osVersion, device};
}

// Chromium 的高熵客户端提示给出真实系统版本：Windows 的 platformVersion 13 及以上是 Windows 11。
export function hintedOsVersion(os: string, platformVersion: unknown) {
  const version = clip(platformVersion, /^\d{1,3}(\.\d{1,5}){0,3}$/);
  if (!version) return '';
  const first = Number(version.split('.')[0]);
  if (os === 'Windows') return first >= 13 ? '11' : first >= 1 ? '10' : '';
  if (['macOS', 'Android', 'ChromeOS'].includes(os)) return String(first);
  return '';
}

export const BOT = /bot\b|crawl|spider|slurp|headless|lighthouse|preview|monitor|curl\/|wget|python-|go-http|node-fetch|axios/i;

export function eventPoint(request: EdgeRequest, input: Record<string, unknown>): DataPoint | null {
  const event = clip(input.event, /^[a-z_]{1,16}$/);
  if (!EVENTS.has(event)) return null;
  const ua = request.headers.get('User-Agent') ?? '';
  const agent = userAgentSummary(ua);
  const langs = preferredLanguages(request.headers.get('Accept-Language'));
  const path = clip(input.path, /^\/[\w\-/]{0,40}$/);
  const referrer = clip(input.referrer, /^[a-z0-9.-]{1,64}$/i).toLowerCase();
  const blobs: Record<(typeof BLOBS)[number], string> = {
    event,
    page_lang: PAGE_LANGS.has(String(input.lang)) ? String(input.lang) : 'other',
    path: PAGES.has(path) ? path : 'other',
    pref_lang: langs.preferred,
    pref_langs: langs.languages,
    country: clip(request.cf?.country, /^[A-Z0-9]{2}$/),
    browser: agent.browser,
    browser_version: agent.browserVersion,
    os: agent.os,
    os_version: hintedOsVersion(agent.os, input.platformVersion) || agent.osVersion,
    device: agent.device,
    referrer: referrer === new URL(request.url).hostname ? '(internal)' : referrer || '(direct)',
    detail: clip(input.detail, /^[\w-]{1,24}$/),
    arch: clip(input.arch, /^(arm|x86)(32|64)?$/),
    utm_source: clip(input.utm, /^[\w.-]{1,32}$/).toLowerCase(),
  };
  // 唯一的 index 是采样键，用低基数且稳定的事件名，不放日期或访客标识。
  return {indexes: [event], blobs: BLOBS.map(name => blobs[name]), doubles: [1]};
}

async function readEvent(request: EdgeRequest) {
  const origin = request.headers.get('Origin');
  if (origin && origin !== new URL(request.url).origin) return 403;
  if (Number(request.headers.get('Content-Length') ?? 0) > MAX_BODY) return 413;
  const text = await request.text();
  if (text.length > MAX_BODY) return 413;
  try {
    const input: unknown = JSON.parse(text);
    return input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : 400;
  } catch {return 400}
}

export async function handleEvent(request: EdgeRequest, env: Env) {
  if (request.method !== 'POST') return new Response(null, {status: 405, headers: {Allow: 'POST'}});
  const input = await readEvent(request);
  if (typeof input === 'number') return new Response(null, {status: input});
  const point = eventPoint(request, input);
  if (!point) return new Response(null, {status: 400});
  if(env.EVENT_LIMIT&&!(await env.EVENT_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)return new Response(null,{status:429,headers:{'cache-control':'no-store','retry-after':'60'}});
  // 爬虫与无头浏览器照常返回成功，只是不记录。
  if (!BOT.test(request.headers.get('User-Agent') ?? '')&&!/(?:^|;\s*)peach_analytics_off=1(?:;|$)/.test(request.headers.get('Cookie')||'')) env.SITE_EVENTS.writeDataPoint(point);
  return new Response(null, {status: 204, headers: {'Cache-Control': 'no-store'}});
}
