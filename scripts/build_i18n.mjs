// 由中文页生成其他语言的页面。中文 HTML 是唯一手编源，译文按原文片段保存在 i18n/<语言>.json。
// 文字节点与可读属性按整段原文查表；带 translate="no" 的子树连同属性保留原文。脚本里的动态文案用 t('原文')，
// 生成的页面注入 window.PEACH_I18N 供脚本查表。中文改动后缺译或多余的译文都会让检查失败。
import {readFile, writeFile, mkdir, readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const CJK = /[　-〿぀-ヿ㐀-鿿＀-￯]/;
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const TEXT_ATTRIBUTES = new Set(['alt', 'title', 'aria-label', 'placeholder', 'content', 'data-label', 'data-say', 'data-title', 'data-done']);
const TAG = String.raw`<\/?[a-zA-Z](?:[^>"']|"[^"]*"|'[^']*')*>`;
const TOKENS = new RegExp(String.raw`<!--[\s\S]*?-->|<![^>]*>|<(script|style)\b(?:[^>"']|"[^"]*"|'[^']*')*>[\s\S]*?<\/\1>|${TAG}|[^<]+|<`, 'g');
const ATTRIBUTE = /(\s)([^\s=/>]+)(\s*=\s*)("([^"]*)"|'([^']*)')/g;
const RUNTIME_CALL = /\bt\((['"])((?:(?!\1)[^\\\n])*)\1\)/g;

const escapeAttribute = (value, quote) => value.replaceAll('&', '&amp;').replaceAll(quote, quote === '"' ? '&quot;' : '&#39;')
  .replaceAll('&amp;amp;', '&amp;').replace(/&amp;(#?\w+;)/g, '&$1');

function translateTag(tag, locale, report, skip) {
  if (skip) return tag;
  return tag.replace(ATTRIBUTE, (all, space, name, equals, quoted, double, single) => {
    const quote = double === undefined ? "'" : '"';
    const value = double ?? single;
    const mapped = locale.attributes?.[name]?.[value];
    if (mapped !== undefined) return `${space}${name}${equals}${quote}${escapeAttribute(mapped, quote)}${quote}`;
    if (!TEXT_ATTRIBUTES.has(name) || !CJK.test(value)) return all;
    report.used.add(value);
    if (!Object.hasOwn(locale.text, value)) {report.missing.add(value); return all}
    return `${space}${name}${equals}${quote}${escapeAttribute(locale.text[value], quote)}${quote}`;
  });
}

export function translateHtml(html, locale, report = {missing: new Set(), used: new Set()}) {
  const stack = [{name: '#root', skip: false}];
  let out = '';
  for (const [token, raw] of html.matchAll(TOKENS)) {
    const skip = stack.at(-1).skip;
    if (raw || token.startsWith('<!') || token === '<') { out += token; continue }
    if (token.startsWith('</')) {
      const name = token.slice(2).match(/^[^\s>]+/)[0].toLowerCase();
      const index = stack.findLastIndex(entry => entry.name === name);
      if (index > 0) stack.length = index;
      out += token;
      continue;
    }
    if (token.startsWith('<')) {
      const name = token.slice(1).match(/^[^\s/>]+/)[0].toLowerCase();
      if (!VOID.has(name) && !token.endsWith('/>')) stack.push({name, skip: skip || /\stranslate\s*=\s*["']?no\b/i.test(token)});
      let tag = translateTag(token, locale, report, skip);
      if (name === 'body') tag = tag.replace(/\sdata-copy-overrides=("[^"]*"|'[^']*')/, '');
      out += tag;
      continue;
    }
    const [, before, core, after] = token.match(/^(\s*)([\s\S]*?)(\s*)$/);
    if (skip || !core || !(Object.hasOwn(locale.text, core) || CJK.test(core))) { out += token; continue }
    report.used.add(core);
    if (!Object.hasOwn(locale.text, core)) { report.missing.add(core); out += token; continue }
    out += before + locale.text[core] + after;
  }
  return out;
}

async function scriptSources() {
  const files = [];
  async function walk(directory) {
    for (const entry of await readdir(path.join(root, directory), {withFileTypes: true})) {
      const relative = path.posix.join(directory, entry.name);
      if (entry.isDirectory()) { if (!['vendor', 'en'].includes(entry.name)) await walk(relative) }
      else if (/\.(m?js|html)$/.test(entry.name)) files.push(relative);
    }
  }
  await walk('site');
  return files;
}

export async function buildLocale(code, {write = false} = {}) {
  const locale = JSON.parse(await readFile(path.join(root, 'i18n', `${code}.json`), 'utf8'));
  const report = {missing: new Set(), used: new Set(), runtimeMissing: new Set(), runtimeUsed: new Set(), stale: [], changed: []};
  const runtime = JSON.stringify(locale.runtime).replaceAll('<', '\\u003c');
  for (const [source, target] of Object.entries(locale.pages)) {
    // 签出可能是 CRLF；统一按 LF 生成与比较。
    const html = (await readFile(path.join(root, 'site', source), 'utf8')).replaceAll('\r\n', '\n');
    const banner = `<!-- 由 scripts/build_i18n.mjs 从 site/${source} 生成，译文在 i18n/${code}.json；不要直接编辑本文件。 -->\n`;
    const translated = translateHtml(html, locale, report)
      .replace(/^<!doctype html>\n/i, match => match + banner)
      .replace('</head>', `<script>window.PEACH_I18N=${runtime}</script>\n</head>`);
    const file = path.join(root, 'site', target);
    const current = (await readFile(file, 'utf8').catch(() => null))?.replaceAll('\r\n', '\n');
    if (current !== translated) {
      report.changed.push(target);
      if (write) { await mkdir(path.dirname(file), {recursive: true}); await writeFile(file, translated) }
    }
  }
  for (const file of await scriptSources()) {
    for (const [, , text] of (await readFile(path.join(root, file), 'utf8')).matchAll(RUNTIME_CALL)) {
      report.runtimeUsed.add(text);
      if (!Object.hasOwn(locale.runtime, text)) report.runtimeMissing.add(text);
    }
  }
  report.stale = [...Object.keys(locale.text).filter(key => !report.used.has(key)).map(key => `text: ${key}`),
    ...Object.keys(locale.runtime).filter(key => !report.runtimeUsed.has(key)).map(key => `runtime: ${key}`)];
  return report;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  let failed = false;
  for (const code of ['en']) {
    const report = await buildLocale(code, {write: !check});
    const problems = [...[...report.missing].map(text => `缺少译文：${text}`), ...[...report.runtimeMissing].map(text => `缺少脚本译文：${text}`),
      ...report.stale.map(text => `译文不再使用：${text}`), ...(check ? report.changed.map(file => `页面需要重新生成：site/${file}`) : [])];
    for (const problem of problems) console.error(`[${code}] ${problem}`);
    if (problems.length) failed = true;
    else if (!check) console.log(`[${code}] ${report.changed.length ? '已生成 ' + report.changed.join('、') : '页面已是最新'}`);
  }
  if (failed) {
    console.error('补齐或删除 i18n/<语言>.json 中的译文后，运行 npm run i18n 重新生成页面。');
    process.exit(1);
  }
}
