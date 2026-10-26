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
    for (const width of [390, 1440]) {
        const page = await browser.newPage({ viewport: { width, height: 844 }, javaScriptEnabled: false });
        try {
            const pictures: string[] = [];
            page.on('request', request => { if (request.url().includes('/screenshots/')) pictures.push(request.url()); });
            await page.goto(base, { waitUntil: 'load' });
            const shot = await page.locator('#screen picture.on img').evaluate(img => {
                let opacity = 1;
                for (let node: Element | null = img; node; node = node.parentElement) opacity *= Number(getComputedStyle(node).opacity);
                return { opacity, src: (img as HTMLImageElement).currentSrc, decoded: (img as HTMLImageElement).naturalWidth > 0 };
            });
            assert.equal(shot.opacity, 1, '导览主图在脚本不可用时直接可见');
            assert.equal(shot.decoded, true);
            assert.equal(pictures.length, 1, '响应式预加载与实际主图共用一次下载');
            assert.equal(shot.src.includes('-compact-'), width <= 560);
            report.push({ width, javascript: false, shot, pictureRequests: pictures.length });
        } finally { await page.close(); }
    }
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
            assert.equal(await page.locator('.feature-more').count(),1);
            const navButtons=page.locator('.nav-end .icon-btn,.nav-end>.btn');
            assert.equal(await navButtons.count(),3);
            assert.equal(await page.locator('.nav-github').isVisible(),true);
            if(width<=560){
                for(const button of await navButtons.all()){
                    const box=(await button.boundingBox())!;
                    assert.equal(box.width,36);assert.equal(box.height,36);
                    assert.ok(box.x>=0&&box.x+box.width<=width,'三个图标完整落在视口内');
                }
                await page.locator('.lang-menu button').click();
                const menu=(await page.locator('.lang-list').boundingBox())!;
                assert.ok(menu.x>=0&&menu.x+menu.width<=width,'语言弹层完整落在视口内');
                await page.keyboard.press('Escape');
            }
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
                await page.waitForFunction(() => {const frame=document.getElementById('screen')!,shot=document.querySelector('#screen picture.on')!;return Math.abs(shot.getBoundingClientRect().left-frame.getBoundingClientRect().left-frame.clientLeft)<1});
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
            if(width<720){
                await page.evaluate(()=>scrollTo({top:document.querySelector('.feature-reel-wrapper')!.getBoundingClientRect().top+scrollY-180,behavior:'instant'}));
                const cardBox=(await page.locator('.feature-card').first().boundingBox())!;
                assert.ok(cardBox.height<440,'手机功能卡保持紧凑');
                await page.locator('.feature-pagination').scrollIntoViewIfNeeded();
                const position=await page.locator('.feature-pagination').evaluate(el=>({top:el.getBoundingClientRect().top,cardBottom:document.querySelector('.feature-reel-wrapper')!.getBoundingClientRect().bottom}));
                assert.ok(position.top>=position.cardBottom,'切换按钮位于卡片下方');
                for(const button of await page.locator('.feature-pagination button').all()){
                    const target=await button.evaluate(el=>{
                        const box=el.getBoundingClientRect(),notice=document.querySelector('.site-notice')!.getBoundingClientRect();
                        return {width:box.width,height:box.height,bottom:box.bottom,noticeTop:notice.top,hit:el.contains(document.elementFromPoint(box.left+box.width/2,box.top+box.height/2))};
                    });
                    assert.equal(target.width,44);assert.equal(target.height,44);assert.equal(target.hit,true,'按钮没有被浮层遮挡');assert.ok(target.bottom<target.noticeTop);
                }
                const scroll=()=>page.locator('.feature-reel').evaluate(el=>el.scrollLeft),start=await scroll();
                await page.locator('[data-feature-step="1"]').click();
                await page.waitForFunction(start=>document.querySelector('.feature-reel')!.scrollLeft>start+10,start);
                const moved=await scroll();await page.locator('[data-feature-step="-1"]').click();
                await page.waitForFunction(moved=>document.querySelector('.feature-reel')!.scrollLeft<moved-10,moved);
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
