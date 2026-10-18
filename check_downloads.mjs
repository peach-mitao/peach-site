import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8795/';
const live = process.argv.includes('--live');
const api = 'https://api.github.com/repos/peach-mitao/peach/releases?per_page=30';
const releasesUrl = 'https://github.com/peach-mitao/peach/releases';
const release = (version, published_at, overrides = {}) => ({
  tag_name: `v${version}`, published_at, prerelease: true, draft: false,
  assets: [`Peach-${version}-windows-x64-setup.exe`, `Peach-${version}-windows-x64.zip`,
    `Peach-${version}-windows-x64-lite-setup.exe`, `Peach-${version}-windows-x64-update.zip`,
    `Peach-${version}-windows-x64-tools-ffmpeg.zip`].map(name => ({name, state: 'uploaded'})),
  ...overrides,
});
const older = release('10.20.30', '2030-01-01T00:00:00Z');
const newer = release('123.456.789', '2030-02-01T00:00:00Z');
const cases = [
  {name: '公开预发布的两种全新安装包', body: [newer, older], version: '123.456.789'},
  {name: '按发布时间选择版本', body: [older, newer], version: '123.456.789'},
  {name: '草稿发布', body: [{...newer, draft: true}, older], version: '10.20.30'},
  {name: '两种包均上传完成', body: [{...newer, assets: newer.assets.map((a, i) => i === 1 ? {...a, state: 'starter'} : a)}, older], version: '10.20.30'},
  {name: '仅有更新包与工具包', body: [{...newer, assets: newer.assets.slice(2)}]},
  {name: 'API 限流', status: 403, body: {message: 'API rate limit exceeded'}},
  {name: 'API 格式异常', body: {message: 'Unavailable'}},
  {name: 'API 网络失败', abort: true},
  {name: '浏览器未启用 JavaScript', noJS: true},
];
const browser = await chromium.launch({channel: 'chrome'});
try {
  for (const width of [390, 1440]) {
    for (const scenario of live ? [{name: '公开 Release 实际文件', live: true}] : cases) {
      const page = await browser.newPage({viewport: {width, height: 900}, reducedMotion: 'reduce', javaScriptEnabled: !scenario.noJS});
      try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        if (!scenario.live) await page.route(api, route => scenario.abort ? route.abort() : route.fulfill({
          status: scenario.status ?? 200, contentType: 'application/json',
          headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(scenario.body),
        }));
        const responsePromise = scenario.live ? page.waitForResponse(api) : null;
        await page.goto(base, {waitUntil: 'networkidle'});
        let version = scenario.version;
        if (scenario.live) {
          const response = await responsePromise;
          assert.equal(response.status(), 200, '公开 API 可访问');
          const published = (await response.json()).filter(r => !r.draft && r.published_at)
            .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at));
          const ready = published.find(r => ['-setup.exe', '.zip'].every(suffix =>
            r.assets.some(a => a.name === `Peach-${r.tag_name.replace(/^v/, '')}-windows-x64${suffix}` && a.state === 'uploaded')));
          assert.ok(ready, '公开发布具有两种完整下载包');
          version = ready.tag_name.replace(/^v/, '');
        }
        const downloads = await page.locator('.package-option a').evaluateAll(links => links.map(link => ({text: link.textContent, href: link.href})));
        assert.equal(downloads.length, 2);
        if (version) {
          const names = [`Peach-${version}-windows-x64-setup.exe`, `Peach-${version}-windows-x64.zip`];
          assert.deepEqual(downloads.map(d => d.text), names);
          assert.deepEqual(downloads.map(d => d.href), names.map(name => `${releasesUrl}/download/v${version}/${name}`));
        } else {
          assert.deepEqual(downloads.map(d => d.text), ['安装包（.exe）', '免安装包（.zip）']);
          assert.ok(downloads.every(d => d.href === releasesUrl));
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '文件名完整换行');
        assert.deepEqual(errors, []);
        console.log('PASS', width, scenario.name, version ?? 'Releases 入口');
      } finally {await page.close()}
    }
  }
} finally {await browser.close()}
