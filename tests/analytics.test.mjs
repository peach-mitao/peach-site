import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker/index.ts';
import {BLOBS, EVENT_PATH, hintedOsVersion, preferredLanguages, userAgentSummary} from '../worker/events.ts';
import {REPORTS, formatTable, querySql, reportSql} from '../scripts/analytics_report.mjs';

const CHROME_WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const SAFARI_MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15';

function setup() {
  const points = [], assets = [];
  const env = {
    SITE_EVENTS: {writeDataPoint: point => points.push(point)},
    ASSETS: {fetch: async request => {assets.push(new URL(request.url).pathname); return new Response('asset')}},
  };
  return {env, points, assets};
}

function post(body, headers = {}) {
  const request = new Request('https://peach.video' + EVENT_PATH, {method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: {'User-Agent': CHROME_WIN, 'Accept-Language': 'ja,en-US;q=0.8,en;q=0.7', Origin: 'https://peach.video', ...headers}});
  return Object.assign(request, {cf: {country: 'JP'}});
}

const named = point => Object.fromEntries(BLOBS.map((name, index) => [name, point.blobs[index]]));

test('Accept-Language 按权重取首选语言与前三种主语言', () => {
  assert.deepEqual(preferredLanguages('zh-CN,zh;q=0.9,en;q=0.8'), {preferred: 'zh-CN', languages: 'zh,en'});
  assert.deepEqual(preferredLanguages('ja;q=0.5, fr-ca, en;q=0.7, de;q=0.1'), {preferred: 'fr-CA', languages: 'fr,en,ja'});
  assert.deepEqual(preferredLanguages('zh-Hant-TW,en;q=0'), {preferred: 'zh-TW', languages: 'zh'});
  assert.deepEqual(preferredLanguages('*'), {preferred: '', languages: ''});
  assert.deepEqual(preferredLanguages(null), {preferred: '', languages: ''});
});

test('UA 只归纳为浏览器族、系统族与主版本', () => {
  assert.deepEqual(userAgentSummary(CHROME_WIN), {browser: 'Chrome', browserVersion: '141', os: 'Windows', osVersion: '10+', device: 'desktop'});
  assert.deepEqual(userAgentSummary(SAFARI_MAC), {browser: 'Safari', browserVersion: '26', os: 'macOS', osVersion: '10.15+', device: 'desktop'});
  assert.deepEqual(userAgentSummary('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0'),
    {browser: 'Edge', browserVersion: '141', os: 'Windows', osVersion: '10+', device: 'desktop'});
  assert.deepEqual(userAgentSummary('Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1'),
    {browser: 'Safari', browserVersion: '18', os: 'iOS', osVersion: '18', device: 'mobile'});
  assert.deepEqual(userAgentSummary('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'),
    {browser: 'Chrome', browserVersion: '141', os: 'Android', osVersion: '10', device: 'mobile'});
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 27_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/24A446';
  for (const [ua, browser, version] of [[iphone + ' Twitter for iPhone/12.33', 'X', '12'],
    [iphone + ' MicroMessenger/8.0.79(0x18004f2f) NetType/WIFI Language/zh_CN', 'WeChat', '8'], [iphone, 'iOS WebView', ''],
    ['Mozilla/5.0 (Linux; Android 16; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/155.0.0.0 Mobile Safari/537.36 TwitterAndroid', 'X', '']]) {
    assert.deepEqual([userAgentSummary(ua).browser, userAgentSummary(ua).browserVersion], [browser, version], ua);
  }
  assert.deepEqual(userAgentSummary('Mozilla/5.0 (X11; Linux x86_64; rv:144.0) Gecko/20100101 Firefox/144.0'),
    {browser: 'Firefox', browserVersion: '144', os: 'Linux', osVersion: '', device: 'desktop'});
});

test('客户端提示区分 Windows 10 与 11，并给出 macOS 真实主版本', () => {
  assert.equal(hintedOsVersion('Windows', '15.0.0'), '11');
  assert.equal(hintedOsVersion('Windows', '10.0.0'), '10');
  assert.equal(hintedOsVersion('Windows', '0.3.0'), '');
  assert.equal(hintedOsVersion('macOS', '15.6.1'), '15');
  assert.equal(hintedOsVersion('macOS', 'Sonoma'), '');
  assert.equal(hintedOsVersion('iOS', '18.0'), '');
});

test('页面埋点写入一个数据点，事件名作采样键，不含 IP 与 UA 原文', async () => {
  const {env, points} = setup();
  const response = await worker.fetch(post({event: 'pageview', lang: 'en', path: '/en/', referrer: 'T.co', utm: 'X', platformVersion: '15.0.0', arch: 'x8664'}), env);
  assert.equal(response.status, 204);
  assert.equal(points.length, 1);
  assert.deepEqual(points[0].indexes, ['pageview']);
  assert.deepEqual(points[0].doubles, [1]);
  assert.ok(points[0].blobs.length <= 20 && new TextEncoder().encode(points[0].blobs.join('')).length < 16384);
  assert.deepEqual(named(points[0]), {
    event: 'pageview', page_lang: 'en', path: '/en/', pref_lang: 'ja', pref_langs: 'ja,en', country: 'JP',
    browser: 'Chrome', browser_version: '141', os: 'Windows', os_version: '11', device: 'desktop',
    referrer: 't.co', detail: '', arch: 'x8664', utm_source: 'x',
  });
  assert.ok(!points[0].blobs.some(blob => blob.includes('Mozilla') || blob.includes('AppleWebKit')));
});

test('站内跳转、未知路径与越界值归一，不记录任意输入', async () => {
  const {env, points} = setup();
  await worker.fetch(post({event: 'lang_switch', detail: 'zh-CN', lang: 'xx', path: '/wp-admin/../etc', referrer: 'peach.video', arch: 'mips'}), env);
  const point = named(points[0]);
  assert.equal(point.page_lang, 'other');
  assert.equal(point.path, 'other');
  assert.equal(point.referrer, '(internal)');
  assert.equal(point.detail, 'zh-CN');
  assert.equal(point.arch, '');
  await worker.fetch(post({event: 'download', detail: '<script>'}), env);
  assert.equal(named(points[1]).detail, '');
  assert.equal(named(points[1]).referrer, '(direct)');
});

test('爬虫与无头浏览器返回成功但不记录', async () => {
  const {env, points} = setup();
  for (const agent of ['Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    CHROME_WIN.replace('Chrome/', 'HeadlessChrome/'), 'curl/8.9.1']) {
    assert.equal((await worker.fetch(post({event: 'pageview'}, {'User-Agent': agent}), env)).status, 204);
  }
  assert.equal(points.length, 0);
});

test('拒绝跨站、超长、格式错误和未知事件的埋点', async () => {
  const {env, points} = setup();
  assert.equal((await worker.fetch(post({event: 'pageview'}, {Origin: 'https://evil.example'}), env)).status, 403);
  assert.equal((await worker.fetch(post('x'.repeat(4096)), env)).status, 413);
  assert.equal((await worker.fetch(post('{'), env)).status, 400);
  assert.equal((await worker.fetch(post('[1]'), env)).status, 400);
  assert.equal((await worker.fetch(post({event: 'purchase'}), env)).status, 400);
  assert.equal((await worker.fetch(new Request('https://peach.video' + EVENT_PATH), env)).status, 405);
  assert.equal(points.length, 0);
});

test('其余路径原样交给静态资源', async () => {
  const {env, points, assets} = setup();
  const response = await worker.fetch(new Request('https://peach.video/en/'), env);
  assert.equal(await response.text(), 'asset');
  assert.deepEqual(assets, ['/en/']);
  assert.equal(points.length, 0);
});

test('报表 SQL 按列顺序取 blob，用采样间隔还原计数', () => {
  const sql = reportSql(REPORTS.languages, 30);
  assert.equal(sql, "SELECT blob4 AS pref_lang, blob2 AS page_lang, SUM(_sample_interval) AS hits FROM peach_site_events"
    + " WHERE (index1 = 'pageview') AND timestamp > NOW() - INTERVAL '30' DAY GROUP BY pref_lang, page_lang ORDER BY hits DESC LIMIT 50 FORMAT JSON");
  assert.match(reportSql(REPORTS.actions, 7), /WHERE \(index1 = 'platform' OR index1 = 'mac_help' OR index1 = 'faq'\)/);
  assert.throws(() => reportSql(REPORTS.languages, 365), /1 到 90/);
  for (const report of Object.values(REPORTS)) assert.doesNotThrow(() => reportSql(report, 1));
});

test('查询结果按 SQL API 的 JSON 格式解析并输出占比', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({url, init});
    return new Response(JSON.stringify({meta: [{name: 'pref_lang'}, {name: 'page_lang'}, {name: 'hits'}],
      data: [{pref_lang: 'zh-CN', page_lang: 'zh-CN', hits: '30'}, {pref_lang: 'ja', page_lang: 'en', hits: 10}], rows: 2}));
  };
  const rows = await querySql('SELECT 1', {account: 'acc', token: 'tok', fetch});
  assert.equal(calls[0].url, 'https://api.cloudflare.com/client/v4/accounts/acc/analytics_engine/sql');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer tok');
  assert.equal(formatTable(rows, ['pref_lang', 'page_lang']), [
    'pref_lang  page_lang  hits  share',
    'zh-CN      zh-CN      30    75.0%',
    'ja         en         10    25.0%',
  ].join('\n'));
  await assert.rejects(querySql('SELECT 1', {account: 'acc', token: 'bad', fetch: async () => new Response('denied', {status: 403})}), /403/);
});
