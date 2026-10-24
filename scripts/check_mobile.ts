import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:8795/';
const out = new URL('../evidence/mobile/', import.meta.url);
await mkdir(out, { recursive: true });
const manifest = JSON.parse(await readFile(new URL('../assets-manifest.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const referenced = [...new Set(html.match(/assets\/screenshots\/[\w-]+-(?:wide|compact)-20261025(?:-\d+)*\.webp/g))];
const published = manifest.files.filter((file: { path: string; }) => referenced.includes(file.path));
assert.equal(referenced.length, 42, '六页两套真实应用截图包含4K原图和响应式候选');
assert.equal(published.length, referenced.length, '页面引用的截图均登记哈希');
for (const file of published) {
    const response = await fetch(new URL(file.path, base));
    assert.equal(response.status, 200, file.path);
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, file.bytes, file.path);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, file.path);
}
const browser = await chromium.launch({ channel: 'chrome' }), report: Record<string,any>[] = [];
try {
    for (const width of [320, 390, 560, 561, 1440] as const) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, locale: 'zh-CN', deviceScaleFactor: width === 390 ? 3 : 1, reducedMotion: 'reduce' }), errors: string[] = [], requests: string[] = [];
        page.on('pageerror', e => errors.push(e.message));
        page.on('request', r => { if (r.url().includes('/screenshots/'))
            requests.push(r.url()); });
        try {
            await page.route('https://api.github.com/**', route => route.fulfill({ json: [] }));
            await page.route('**/releases.json', route => route.fulfill({ json: [] }));
            await page.route('https://img.shields.io/docker/v/longmeidao/peach.json?sort=semver', route => route.fulfill({ json: { message: 'v1.2.3' } }));
            await page.goto(base, { waitUntil: 'networkidle' });
            await page.evaluate(() => document.fonts.ready);
            assert.equal(await page.locator('#screen img[src]').count(), 1);
            assert.equal(requests.length, 1, '初次只读取首页截图');
            assert.equal(requests[0].includes('-compact-'), width <= 560, '只读取当前视口的图片');
            assert.equal(await page.locator('.feature-more').isVisible(), width > 560);
            assert.equal(await page.locator('.hero .cta-download .btn-primary').getAttribute('href'), '#download');
            assert.equal(await page.locator('.package-option:visible').count(), 2);
            const downloads = await page.locator('.windows-download .package-option a').evaluateAll(ns => ns.map(n => ({ text: n.textContent.trim(), href: (n as HTMLAnchorElement).href })));
            for (const [index, download] of downloads.entries()) {
                if (download.href === 'https://github.com/peach-mitao/peach/releases') {
                    assert.equal(download.text, index === 0 ? '下载安装版' : '下载免安装版');
                }
                else {
                    assert.match(download.text, index === 0 ? /^Peach-.+-windows-x64-setup\.exe$/ : /^Peach-.+-windows-x64\.zip$/);
                    assert.ok(download.href.endsWith('/' + encodeURIComponent(download.text)));
                }
            }
            const tabs = [];
            for (const key of ['home', 'people', 'profile', 'play', 'follow', 'stats'] as const) {
                await page.locator(`.dock button[data-k="${key}"]`).click();
                await page.waitForFunction(key => (document.querySelector('#screen picture.on') as HTMLElement)?.dataset.k === key, key);
                const shot = page.locator(`#screen picture[data-k="${key}"] img`);
                const dimensions = await shot.evaluate(async (img) => {
                    await (img as HTMLImageElement).decode();
                    const r = img.getBoundingClientRect();
                    return { pixels: [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight], ratio: r.width / r.height, src: (img as HTMLImageElement).currentSrc, fit: getComputedStyle(img).objectFit,
                        file: Number((img as HTMLImageElement).currentSrc.match(/-(\d{3,4})\.webp$/)?.[1] ?? 3840), needed: Math.ceil(r.width * devicePixelRatio) };
                });
                // 按视口取候选：完整桌面截图，比例对，选中文件的像素宽度不少于显示宽度乘设备像素比。
                // 用了 srcset 后 naturalWidth 按候选密度换算，不是文件本身的宽度。
                assert.ok(dimensions.src.includes(width <= 560 ? '-compact-' : '-wide-'), '只读取当前视口的那一套');
                assert.ok(Math.abs(dimensions.pixels[0] / dimensions.pixels[1] - (width <= 560 ? 4 / 3 : 16 / 9)) < .01, '完整桌面截图');
                assert.ok(dimensions.file >= Math.min(3840, dimensions.needed), '截图清晰度不低于屏幕像素');
                assert.ok(Math.abs(dimensions.ratio - (width <= 560 ? 4 / 3 : 16 / 9)) < .01, '画框与截图比例一致');
                assert.equal(dimensions.fit, 'contain');
                assert.equal(await page.locator('#screen picture.on').getAttribute('data-k'), key);
                assert.equal(await page.locator('.dock button[aria-selected=true]').getAttribute('data-k'), key);
                await page.waitForFunction(() => [...(document.querySelectorAll('#screen picture') as NodeListOf<HTMLElement>)].every(p => Math.abs(Number(getComputedStyle(p).opacity) - (p.classList.contains('on') ? 1 : 0)) < .001));
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
                if (width === 390 || width === 1440) {
                    await page.evaluate(() => scrollTo({ top: scrollY + (document.querySelector('.window') as HTMLElement).getBoundingClientRect().top - 100, behavior: 'instant' }));
                    await page.locator('.window').screenshot({ path: fileURLToPath(new URL(`tour-${width}-${key}.png`, out)) });
                }
                tabs.push({ key, ...dimensions });
            }
            if (width === 390) {
                await page.setViewportSize({ width: 1440, height: 900 });
                await page.waitForFunction(() => { const img = (document.querySelector('#screen picture.on img') as HTMLElement); return (img as HTMLImageElement).currentSrc.includes('-wide-') && Math.abs((img as HTMLImageElement).naturalWidth / (img as HTMLImageElement).naturalHeight - 16 / 9) < .01; });
                await page.locator('#screen picture.on img').evaluate(img => (img as HTMLImageElement).decode());
                await page.setViewportSize({ width: 390, height: 844 });
                await page.waitForFunction(() => { const img = (document.querySelector('#screen picture.on img') as HTMLElement); return (img as HTMLImageElement).currentSrc.includes('-compact-') && Math.abs((img as HTMLImageElement).naturalWidth / (img as HTMLImageElement).naturalHeight - 4 / 3) < .01; });
                await page.locator('#screen picture.on img').evaluate(img => (img as HTMLImageElement).decode());
            }
            await page.locator('.hero .cta-download .btn-primary').click();
            assert.equal(new URL(page.url()).hash, '#download');
            await page.locator('.windows-download').screenshot({ path: fileURLToPath(new URL(`downloads-${width}.png`, out)) });
            if (width === 390) {
                let releaseImage!:()=>void;
                const imageGate = new Promise<void>(resolve => { releaseImage = resolve; });
                await page.route('**/people-compact-20261025-2*.webp', async (route) => { await imageGate; await route.continue(); });
                try {
                    await page.reload({ waitUntil: 'networkidle' });
                    await page.locator('.dock button[data-k="people"]').click();
                    assert.equal(await page.locator('#screen picture.on').getAttribute('data-k'), 'home', '等图片解码时保留当前画面');
                    await page.locator('.dock button[data-k="stats"]').click();
                    await page.waitForFunction(() => (document.querySelector('#screen picture.on') as HTMLElement)?.dataset.k === 'stats');
                    releaseImage();
                    await page.locator('#screen picture[data-k="people"] img').evaluate(img => (img as HTMLImageElement).decode());
                    assert.equal(await page.locator('#screen picture.on').getAttribute('data-k'), 'stats', '较早发起的请求不覆盖最后一次选择');
                }
                finally {
                    releaseImage();
                    await page.unroute('**/people-compact-20261025-2*.webp');
                }
            }
            assert.deepEqual(errors, []);
            report.push({ width, tabs, downloads, errors });
            console.log('PASS', width);
        }
        finally {
            await page.close();
        }
    }
}
finally {
    await browser.close();
}
await writeFile(new URL('verification.json', out), JSON.stringify({ base, report }, null, 2));
