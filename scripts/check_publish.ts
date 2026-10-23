import type {IncomingHttpHeaders} from 'node:http';
interface HTTPResult {status:number|undefined;headers:IncomingHttpHeaders;body:Buffer}
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import sharp from 'sharp';
import type { BinaryLike } from 'crypto';
const base = process.argv[2] ?? 'http://127.0.0.1:8790/';
const publicSite = new URL(base).protocol === 'https:';
const httpOnly = process.argv.includes('--http-only');
const out = new URL(`../evidence/deployment/${publicSite ? 'public' : 'local'}/`, import.meta.url);
await mkdir(out, { recursive: true });
const source = await readFile(new URL('../site/index.html', import.meta.url));
const hash = (bytes: BinaryLike|Buffer<any>) => createHash('sha256').update(bytes).digest('hex');
const withoutBeacon = (bytes: Buffer) => Buffer.from(bytes.toString('utf8').replace(/<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\/[^"\r\n]+"[^>]*><\/script>\r?\n/g, ''));
const report: Record<string,any> = { base, checkedAt: new Date().toISOString(), sourceHash: hash(source), assets: [], viewports: [] };
const manifest = JSON.parse(await readFile(new URL('../assets-manifest.json', import.meta.url), 'utf8'));
const video = manifest.files.find((file: { path: string; }) => file.path === 'assets/peach-intro-1080p.mp4');
function request(path: string|URL, headers: Record<string,string> = {}): Promise<HTTPResult> {
    const url = new URL(path, base);
    return new Promise((resolve, reject) => {
        const req = (url.protocol === 'https:' ? https : http).get(url, { headers, timeout: 20000 }, res => {
            const chunks: Buffer[] = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
            res.on('error', reject);
        });
        req.on('timeout', () => req.destroy(new Error(`timeout: ${url}`)));
        req.on('error', reject);
    });
}
async function files(dir: URL, prefix = ''): Promise<string[]> {
    const result = [];
    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = prefix + entry.name;
        if (entry.isDirectory())
            result.push(...await files(new URL(`${entry.name}/`, dir), `${path}/`));
        else
            result.push(path);
    }
    return result;
}
function excluded(path: string) {
    return path.startsWith('_proto/') || ['index-v1.html', 'hello-preview.html', '.assetsignore', '_redirects', '_headers', '404.html', 'assets/sleeve.jpg', video.path].includes(path)
        || /^assets\/dark\/.*\.jpg$/.test(path)
        || (/^assets\/shots\/.*\.jpg$/.test(path) && path !== 'assets/shots/h-dark.jpg')
        || /^assets\/vendor\/sticker-forge\/.*\.d\.ts$/.test(path);
}
let browser;
try {
    const home = await request('/');
    await writeFile(new URL('index.html', out), home.body);
    report.homeHeaders = home.headers;
    report.homeHash = hash(home.body);
    assert.equal(home.status, 200);
    report.homeWithoutBeaconHash = hash(withoutBeacon(home.body));
    assert.equal(report.homeWithoutBeaconHash, hash(source), '扣除 CDN 统计脚本后官网定稿逐字节一致');
    if (publicSite) {
        for (const path of (await files(new URL('../site/', import.meta.url))).filter((path: any) => !excluded(path))) {
            const response = await request(path.endsWith('index.html') ? `/${path.slice(0, -'index.html'.length)}` : `/${path}`);
            const local = await readFile(new URL(`../site/${path}`, import.meta.url));
            assert.equal(response.status, 200, path);
            assert.equal(hash(path.endsWith('.html') ? withoutBeacon(response.body) : response.body), hash(local), path);
            report.assets.push({ path, bytes: local.length, sha256: hash(local) });
        }
        for (const path of ['/index-v1.html', '/hello-preview.html', '/_proto/stickers/', '/assets/dark/detail.jpg', '/assets/sleeve.jpg', '/__edit.js', '/__edit/save'] as const) {
            assert.equal((await request(path)).status, 404, path);
        }
        // 未匹配的路径由静态资源返回 404 页，不进入 Worker，也不计调用次数。
        const missing = await request('/__missing__/');
        assert.equal(missing.status, 404, '未匹配路径');
        assert.equal(hash(withoutBeacon(missing.body)), hash(await readFile(new URL('../site/404.html', import.meta.url))), '未匹配路径返回 404 页');
        const event = await request('/api/event');
        assert.equal(event.status, 405, '埋点入口只接受 POST');
        assert.equal((await request('/?edit')).body.includes(Buffer.from('/__edit.js')), false);
        const legacyVideo = await request('/' + video.path);
        assert.equal(legacyVideo.status, 301, '视频原地址通过静态重定向转到 R2');
        const legacyTarget = new URL(legacyVideo.headers.location!);
        legacyTarget.search = '';
        assert.equal(legacyTarget.href, video.url);
    }
    const localVideo = await readFile(new URL('../site/' + video.path, import.meta.url));
    assert.equal(hash(localVideo), video.sha256);
    const videoPath = video.url;
    const fullVideo = await request(videoPath);
    assert.equal(fullVideo.status, 200);
    assert.equal(fullVideo.headers['content-type'], 'video/mp4');
    assert.equal(fullVideo.body.length, video.bytes);
    assert.equal(hash(fullVideo.body), video.sha256);
    assert.match(fullVideo.headers['cache-control']!, /max-age=31536000/);
    assert.match(fullVideo.headers['cache-control']!, /immutable/);
    report.video = { url: videoPath, bytes: fullVideo.body.length, sha256: hash(fullVideo.body), headers: fullVideo.headers };
    report.videoRanges = [];
    for (const start of [1048576, 0, localVideo.length - 1024] as const) {
        const end = start + 1023;
        const range = await request(videoPath, { Range: `bytes=${start}-${end}` });
        assert.equal(range.status, 206, '视频必须返回真实范围响应');
        assert.equal(range.headers['content-range'], `bytes ${start}-${end}/${localVideo.length}`);
        assert.equal(range.headers['content-length'], '1024');
        assert.deepEqual(range.body, localVideo.subarray(start, end + 1));
        report.videoRanges.push({ start, status: range.status, bytes: range.body.length, contentRange: range.headers['content-range'] });
    }
    const suffix = await request(videoPath, { Range: 'bytes=-1024' });
    assert.equal(suffix.status, 206);
    assert.deepEqual(suffix.body, localVideo.subarray(-1024));
    const invalidRange = await request(videoPath, { Range: `bytes=${localVideo.length}-` });
    assert.equal(invalidRange.status, 416);
    assert.equal(invalidRange.headers['content-range'], `bytes */${localVideo.length}`);
    report.httpPassed = true;
    if (!httpOnly) {
        browser = await chromium.launch({ channel: 'chrome' });
        for (const width of [1440, 390] as const) {
            const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, locale: 'zh-CN', hasTouch: width === 390 });
            try {
                const page = await context.newPage();
                const errors: string[] = [], failed: Record<string,any>[] = [];
                page.on('pageerror', error => errors.push((error instanceof Error ? error.message : String(error))));
                page.on('response', response => { if (response.status() >= 400)
                    failed.push({ url: response.url(), status: response.status() }); });
                assert.equal((await page.goto(base, { waitUntil: 'load', timeout: 45000 }))!.status(), 200);
                await page.waitForTimeout(8500);
                assert.equal(await page.title(), 'Peach · 蜜桃：私人影片馆藏');
                assert.equal(await page.locator('.marks-row').count(), 3);
                assert.equal(await page.locator('#screen img[src]').count(), 1);
                assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
                await page.screenshot({ path: fileURLToPath(new URL(`home-${width}.png`, out)) });
                const tabs = [];
                for (const key of ['people', 'profile', 'play', 'follow', 'stats', 'home'] as const) {
                    await page.locator(`.dock button[data-k="${key}"]`).click();
                    const dimensions = await page.locator(`#screen picture[data-k="${key}"] img`).evaluate(async (img) => { await (img as HTMLImageElement).decode(); return [(img as HTMLImageElement).naturalWidth, (img as HTMLImageElement).naturalHeight, Math.ceil(img.getBoundingClientRect().width * devicePixelRatio), Number((img as HTMLImageElement).currentSrc.match(/-(\d{3,4})\.webp$/)?.[1] ?? 3840)]; });
                    assert.ok(Math.abs(dimensions[0] / dimensions[1] - (width === 390 ? 4 / 3 : 16 / 9)) < .01, key + ' 完整桌面截图');
                    // srcset 下 naturalWidth 按候选密度换算，清晰度按选中文件的像素宽度判断。
                    assert.ok(dimensions[3] >= Math.min(3840, dimensions[2]), key + ' 清晰度不低于屏幕像素');
                    tabs.push({ key, dimensions });
                }
                await page.locator('.marks').scrollIntoViewIfNeeded();
                await page.waitForTimeout(500);
                await page.screenshot({ path: fileURLToPath(new URL(`rows-${width}.png`, out)) });
                await page.locator('.hero [data-media-01-open]').click();
                await page.waitForFunction(() => ((document.querySelector('[data-media-video]') as HTMLElement) as HTMLVideoElement).readyState >= 1, null, { timeout: 30000 });
                await page.evaluate(() => ((document.querySelector('[data-media-video]') as HTMLElement) as HTMLVideoElement).pause());
                assert.equal(await page.locator('[data-media-modal]').evaluate(el => (el as HTMLElement).hidden), false);
                const timeline = page.locator('[data-media-timeline]');
                await timeline.hover();
                const box = await timeline.boundingBox();
                const duration = await page.locator('[data-media-video]').evaluate(v => (v as HTMLVideoElement).duration);
                assert.ok(Math.abs(duration - 74.5) < .05, '介绍视频时长为 74.5 秒');
                assert.deepEqual(await page.locator('[data-media-chapter]').evaluateAll(nodes => nodes.map(n => Number(n.dataset.start))), [0, 5, 10, 15, 21, 26, 32, 38.5, 43.5, 49.5, 55, 60.5, 66, 70.5]);
                const y = box!.y + box!.height / 2;
                if (width === 390)
                    await page.touchscreen.tap(box!.x + box!.width * .5, y);
                else
                    await page.mouse.click(box!.x + box!.width * .5, y);
                await page.waitForFunction(target => { const v = (document.querySelector('[data-media-video]') as HTMLElement); return !(v as HTMLVideoElement).seeking && Math.abs((v as HTMLVideoElement).currentTime - target) < .5 && (v as HTMLVideoElement).readyState >= 2; }, duration * .5, { timeout: 30000 });
                if (width === 1440) {
                    for (const fraction of [.75, .2] as const) {
                        await page.mouse.move(box!.x + box!.width * .5, y);
                        await page.mouse.down();
                        await page.mouse.move(box!.x + box!.width * fraction, y, { steps: 8 });
                        await page.mouse.up();
                        await page.waitForFunction(target => { const v = (document.querySelector('[data-media-video]') as HTMLElement); return !(v as HTMLVideoElement).seeking && Math.abs((v as HTMLVideoElement).currentTime - target) < .5 && (v as HTMLVideoElement).readyState >= 2; }, duration * fraction, { timeout: 30000 });
                    }
                    await page.mouse.move(box!.x + box!.width * .5, y);
                    await page.waitForFunction(target => { const v = (document.querySelector('[data-media-preview-video]') as HTMLElement); return !(v as HTMLVideoElement).seeking && Math.abs((v as HTMLVideoElement).currentTime - target) < .5 && (v as HTMLVideoElement).readyState >= 2; }, duration * .5, { timeout: 30000 });
                    const previewVideo = page.locator('[data-media-preview-video]');
                    const preview: {time:number;width:number;height:number;mean?:number} = await previewVideo.evaluate(v => ({ time: (v as HTMLVideoElement).currentTime, width: (v as HTMLVideoElement).videoWidth, height: (v as HTMLVideoElement).videoHeight }));
                    const pixels = await sharp(await previewVideo.screenshot()).stats();
                    preview.mean = pixels.channels.slice(0, 3).reduce((sum, channel) => sum + channel.mean, 0) / 3;
                    assert.ok(preview.mean > 5, '悬停预览必须解码出非黑帧');
                    report.preview = preview;
                    await page.screenshot({ path: fileURLToPath(new URL('player-preview-1440.png', out)) });
                }
                report.viewports.push({ width, videoSeek: { target: duration * .5, click: true, drag: width === 1440 } });
                await page.keyboard.press('Escape');
                await page.waitForFunction(() => (document.querySelector('[data-media-modal]') as HTMLElement).hidden);
                await page.goto(new URL('/copyright/', base).href, { waitUntil: 'load' });
                assert.equal(await page.locator('#email').getAttribute('href'), 'mailto:dmca@peach.video');
                assert.equal(await page.locator('#prepare').isEnabled(), true);
                assert.deepEqual(errors, []);
                assert.deepEqual(failed, []);
                report.viewports.push({ width, title: 'Peach · 蜜桃：私人影片馆藏', rows: 3, tabs, overflow: false, player: true, copyright: true, errors, failed });
                console.log(`PASS ${width}: 标题、三行资料、六张4K导览、播放器、投诉页`);
            }
            finally {
                await context.close();
            }
        }
    }
    report.passed = !httpOnly;
    report.browserSkipped = httpOnly;
}
catch (error) {
    report.error = error instanceof Error?error.stack:String(error);
    throw error;
}
finally {
    await browser?.close();
    await writeFile(new URL('report.json', out), JSON.stringify(report, null, 2));
}
