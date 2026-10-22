// 匿名访问统计：每次打开页面和几个关键操作各发一条埋点到同源的 /api/event。
// 不用 Cookie 或本地存储，不发访客标识；来源只发域名，系统版本只取 Chromium 的客户端提示。
const endpoint = '/api/event';
let hints = {};
const hintsReady = (navigator.userAgentData?.getHighEntropyValues?.(['platformVersion', 'architecture', 'bitness']) ?? Promise.resolve({}))
  .then(values => {hints = values}, () => {});

function referrerHost() {
  try {return document.referrer ? new URL(document.referrer).hostname : ''} catch {return ''}
}

// 同步发出：点击链接随即跳页时，埋点已经交给浏览器。
export function track(event, detail = '') {
  const pageview = event === 'pageview';
  const body = JSON.stringify({
    event, detail,
    lang: document.documentElement.lang,
    path: location.pathname,
    referrer: pageview ? referrerHost() : '',
    utm: pageview ? new URLSearchParams(location.search).get('utm_source') ?? '' : '',
    platformVersion: hints.platformVersion ?? '',
    arch: hints.architecture ? hints.architecture + (hints.bitness ?? '') : '',
  });
  try {
    if (!navigator.sendBeacon?.(endpoint, body)) void fetch(endpoint, {method: 'POST', body, keepalive: true}).catch(() => {});
  } catch { /* 统计失败不影响页面。 */ }
}

void hintsReady.then(() => track('pageview'));
// 捕获阶段监听，按钮自身的处理器（弹窗、切换面板）照常执行。
document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  const lang = target?.closest('a[href][lang]');
  if (lang && lang.getAttribute('lang') !== document.documentElement.lang) return track('lang_switch', lang.getAttribute('lang'));
  const download = target?.closest('[data-download]');
  if (download) return track('download', download.dataset.download);
  const primary = target?.closest('[data-primary-download]');
  // 首屏按钮按访客平台指向不同的包，按文件类型区分；还没有可下载的包时跳到下载区。
  if (primary) return track('download', 'primary-' + (primary.pathname.match(/\.(exe|zip|dmg)$/i)?.[1].toLowerCase() ?? 'none'));
  const platform = target?.closest('[data-platform-option]');
  if (platform) return track('platform', platform.dataset.platformOption);
  if (target?.closest('[data-mac-help]')) track('mac_help');
}, true);
document.querySelectorAll('#faq details').forEach((details, index) => details.addEventListener('toggle', () => {
  if (details.open) track('faq', String(index + 1));
}));
