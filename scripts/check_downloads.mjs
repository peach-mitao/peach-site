import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {platformFor, macArchitecture, downloadsFor} from '../site/assets/downloads.js';

const base = process.argv[2] ?? 'http://127.0.0.1:8795/';
const live = process.argv.includes('--live');
const api = 'https://api.github.com/repos/peach-mitao/peach/releases?per_page=30';
const releasesUrl = 'https://github.com/peach-mitao/peach/releases';
const r2Base = 'https://downloads.peach.video';
const r2Api = r2Base + '/releases.json';
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
  {name: 'R2 可下载且 GitHub 不可用', r2: [newer], body: [], githubAbort: true, version: '123.456.789', source: 'r2'},
  {name: 'R2 旧版与 GitHub 新版并存', r2: [older], body: [newer], version: '123.456.789'},
  {name: '两边同版优先 R2', r2: [newer], body: [newer], version: '123.456.789', source: 'r2'},
  {name: 'R2 新版与 GitHub 旧版并存', r2: [newer], body: [older], version: '123.456.789', source: 'r2'},
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
const macUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15';
const safari = {userAgent: macUA, platform: 'MacIntel', maxTouchPoints: 0};
assert.equal(platformFor(safari), 'macos');
assert.equal(await macArchitecture(safari), null, 'Safari 的 Intel UA 不是芯片证据');
assert.equal(platformFor({...safari, maxTouchPoints: 5}), 'other', '桌面模式 iPad 不推荐 Mac 包');
for (const [hint, expected] of [['arm', 'arm64'], ['x86', 'x86_64'], ['', null]]) {
  assert.equal(await macArchitecture({...safari, userAgentData: {platform: 'macOS',
    getHighEntropyValues: async () => ({architecture: hint, bitness: '64'})}}), expected);
}
assert.equal(await macArchitecture({...safari, userAgentData: {platform: 'macOS',
  getHighEntropyValues: async () => {throw new Error('restricted')}}}), null);
const both = release('0.46.1', '2031-01-01T00:00:00Z');
both.assets.push(...['arm64', 'x86_64'].map(arch => ({name: `Peach-0.46.1-macos-${arch}.dmg`, state: 'uploaded'})));
assert.equal(downloadsFor([both]).macos.version, '0.46.1');
assert.equal(downloadsFor([{...both, assets: both.assets.slice(0, -1)}]).macos, undefined,
  '同版双架构尚未完整上传时不显示已就绪');
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? {channel: process.env.PLAYWRIGHT_CHANNEL} : {});
try {
  for (const width of [390, 1440]) {
    for (const scenario of live ? [{name: '公开 Release 实际文件', live: true}] : cases) {
      const page = await browser.newPage({viewport: {width, height: 900}, reducedMotion: 'reduce', javaScriptEnabled: !scenario.noJS});
      try {
        const errors = [];
        const failedRequests = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('requestfailed', request => failedRequests.push({url: request.url(), error: request.failure()?.errorText}));
        if (!scenario.live) await page.route(r2Api, route => route.fulfill({json: scenario.r2 ?? [],
          headers: {'access-control-allow-origin': '*'}}));
        if (!scenario.live) await page.route(api, route => scenario.abort || scenario.githubAbort ? route.abort() : route.fulfill({
          status: scenario.status ?? 200, contentType: 'application/json',
          headers: {'access-control-allow-origin': '*'}, body: JSON.stringify(scenario.body),
        }));
        const responsePromise = scenario.live ? page.waitForResponse(api) : null;
        const navigation = await page.goto(base, {waitUntil: 'networkidle'});
        assert.equal(navigation.status(), 200, `预览响应：${navigation.status()} ${page.url()}`);
        await page.waitForLoadState('domcontentloaded');
        assert.deepEqual(errors, [], `页面脚本错误：${JSON.stringify({errors, failedRequests})}`);
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
        if (version) await page.waitForFunction(expected => {
          const links = [...document.querySelectorAll('.windows-download .package-option a')];
          return links.length === 2 && links.every(link => link.title.startsWith(`Peach-${expected}-windows-x64`));
        }, version);
        const downloads = await page.locator('.windows-download .package-option a').evaluateAll(links => links.map(link => ({text: link.textContent, href: link.href, title: link.title})));
        assert.equal(downloads.length, 2, `预览页面：${JSON.stringify({url: page.url(), title: await page.title(),
          body: (await page.locator('body').innerText()).slice(0, 1000), errors, failedRequests})}`);
        assert.deepEqual(downloads.map(d => d.text), ['下载安装版', '下载免安装版']);
        if (version) {
          const names = [`Peach-${version}-windows-x64-setup.exe`, `Peach-${version}-windows-x64.zip`];
          assert.deepEqual(downloads.map(d => d.title), names,
            `下载状态：${JSON.stringify({errors, failedRequests, scripts: await page.locator('script[src]').evaluateAll(elements => elements.map(element => element.src))})}`);
          assert.deepEqual(downloads.map(d => d.href), names.map(name => `${scenario.source === 'r2' ? r2Base : releasesUrl + '/download'}/v${version}/${name}`));
        } else {
          assert.ok(downloads.every(d => d.href === releasesUrl));
        }
        if (!scenario.live) {
          for (const arch of ['arm64', 'x86_64']) {
            const mac = page.locator(`[data-download="macos-${arch}"]`);
            assert.equal(await mac.getAttribute('aria-disabled'), 'true');
            assert.equal(await mac.getAttribute('href'), '#download');
          }
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '文件名完整换行');
        assert.deepEqual(errors, []);
        console.log('PASS', width, scenario.name, version ?? 'Releases 入口');
      } finally {await page.close()}
    }
  }
  if (!live) for (const width of [390, 1440]) {
    for (const scenario of [
      {name: 'Windows', platform: 'Win32', ua: 'Windows NT 10.0; Win64; x64', system: 'windows', icon: '#i-windows', file: '-windows-x64-setup.exe'},
      {name: 'Apple Silicon', platform: 'MacIntel', ua: macUA, architecture: 'arm', system: 'macos', icon: '#i-apple', file: '-macos-arm64.dmg'},
      {name: 'Intel Mac', platform: 'MacIntel', ua: macUA, architecture: 'x86', system: 'macos', icon: '#i-apple', file: '-macos-x86_64.dmg'},
      {name: 'Safari 芯片未知', platform: 'MacIntel', ua: macUA, system: 'macos', icon: '#i-apple', file: '#download'},
      {name: 'iPad 桌面模式', platform: 'MacIntel', ua: macUA, touch: 5, system: 'other', icon: '#i-download', file: '#download'},
      {name: 'Linux', platform: 'Linux x86_64', ua: 'X11; Linux x86_64', system: 'other', icon: '#i-download', file: '#download'},
    ]) {
      const page = await browser.newPage({viewport: {width, height: 900}, reducedMotion: 'reduce'});
      try {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.addInitScript(s => {
          Object.defineProperty(navigator, 'userAgent', {value: s.ua, configurable: true});
          Object.defineProperty(navigator, 'platform', {value: s.platform, configurable: true});
          Object.defineProperty(navigator, 'maxTouchPoints', {value: s.touch || 0, configurable: true});
          Object.defineProperty(navigator, 'userAgentData', {value: s.architecture ? {
            platform: 'macOS', getHighEntropyValues: async () => ({architecture: s.architecture, bitness: '64'}),
          } : undefined, configurable: true});
        }, scenario);
        await page.route(r2Api, route => route.fulfill({json: [], headers: {'access-control-allow-origin': '*'}}));
        await page.route(api, route => route.fulfill({json: [both], headers: {'access-control-allow-origin': '*'}}));
        await page.goto(base, {waitUntil: 'networkidle'});
        const primary = page.locator('[data-primary-download]');
        assert.equal(await primary.count(), 3);
        const expected = scenario.system === 'other' ? '下载 Peach' : `下载 ${scenario.system === 'macos' ? 'macOS' : 'Windows'} 版`;
        assert.deepEqual(await primary.locator('span').allTextContents(), [expected, expected, expected]);
        for (const link of await primary.all()) {
          assert.ok((await link.getAttribute('href')).endsWith(scenario.file));
          assert.equal(await link.locator('use').getAttribute('href'), scenario.icon);
        }
        assert.equal(await page.locator('[data-source-shell]').innerText(), scenario.system === 'macos' ? 'zsh' : 'PowerShell');
        await page.locator('[data-platform-option="macos"]').click();
        assert.equal(await page.locator('[data-download-panel="macos"]').isVisible(), true);
        assert.equal(await page.locator('[data-platform-option="macos"]').getAttribute('aria-pressed'), 'true');
        const arm = await page.locator('[data-download="macos-arm64"]').boundingBox();
        const intel = await page.locator('[data-download="macos-x86_64"]').boundingBox();
        if (width >= 1000) {
          assert.ok(Math.abs(arm.y - intel.y) < 1 && intel.x >= arm.x + arm.width + 12,
            '宽容器中的两个 Mac 版本应在同一行');
          assert.ok(Math.abs(arm.width - intel.width) < 1, '两个版本按钮等宽');
        } else {
          assert.ok(intel.y >= arm.y + arm.height + 8, '窄容器中的版本按钮应正常换行');
        }
        const icons = await page.evaluate(() => {
          const primary = document.querySelector('[data-primary-download]');
          const button = primary.getBoundingClientRect();
          const icon = primary.querySelector('svg').getBoundingClientRect();
          const path = document.querySelector('#i-apple path').getBBox();
          return {size: icon.width, height: icon.height,
            centerDifference: Math.abs(icon.y + icon.height / 2 - button.y - button.height / 2),
            appleHeight: path.height / 24};
        });
        assert.ok(icons.size >= 16 && icons.size <= 20);
        assert.equal(icons.height, icons.size);
        assert.ok(icons.centerDifference <= 0.5, '图标与按钮垂直居中');
        assert.ok(icons.appleHeight >= 0.95, 'Apple 矢量轮廓不能被大面积留白缩小');
        if (scenario.name === 'Windows') {
          const ink = await page.evaluate(() => {
            const measure = svg => {
              const b = svg.getBBox(), matrix = svg.getScreenCTM();
              return {width: b.width * matrix.a, height: b.height * matrix.d};
            };
            const all = selector => [...document.querySelectorAll(selector)].filter(svg => svg.getBoundingClientRect().width > 0).map(measure);
            return {apple: all('.btn svg:has(use[href="#i-apple"])'),
              github: all('.btn svg:has(use[href="#i-github"])'),
              demo: all('.cta svg:has(use[href="#i-demo"])'),
              video: measure(document.querySelector('.cta [data-media-01-open] svg'))};
          });
          for (const kind of ['apple', 'github', 'demo']) {
            assert.ok(ink[kind].every(glyph => glyph.height >= 14 && glyph.height <= 18), `${kind} 的实际轮廓应与同级文字协调`);
            assert.ok(Math.max(...ink[kind].map(glyph => glyph.height)) - Math.min(...ink[kind].map(glyph => glyph.height)) < 0.5,
              `${kind} 在同类入口保持相同视觉尺寸`);
          }
          assert.ok(ink.video.height >= 12 && ink.video.width >= 20, '横向视频轮廓应保留比例且清晰可辨');
        }
        await page.locator('[data-platform-option="windows"]').click();
        assert.equal(await page.locator('[data-download-panel="windows"]').isVisible(), true);
        assert.ok((await primary.first().getAttribute('href')).endsWith('-windows-x64-setup.exe'));
        const setup = await page.locator('[data-download="setup"]').boundingBox();
        const portable = await page.locator('[data-download="portable"]').boundingBox();
        if (width >= 1000) {
          assert.ok(Math.abs(setup.y - portable.y) < 1 && portable.x >= setup.x + setup.width + 12,
            '宽容器中的两个 Windows 版本应在同一行');
          assert.ok(Math.abs(setup.width - portable.width) < 1, '两个 Windows 版本按钮等宽');
        } else {
          assert.ok(portable.y >= setup.y + setup.height + 8, '窄容器中的 Windows 版本应正常换行');
        }
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
        assert.deepEqual(errors, []);
        console.log('PASS', width, scenario.name, '按钮、图标、链接、手动切换');
      } finally {await page.close()}
    }
  }
} finally {await browser.close()}
