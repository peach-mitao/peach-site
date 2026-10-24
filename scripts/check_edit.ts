import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { chromium, type Locator } from 'playwright';
import sharp from 'sharp';
import { createPreviewServer } from './serve.ts';
// 写操作只落到临时站点，验证真实编辑、平台切换、重绘与刷新后的持久化。
const root = await mkdtemp(path.join(tmpdir(), 'peach-edit-browser-'));
await cp(fileURLToPath(new URL('../site/', import.meta.url)), root, { recursive: true,
    filter: source => !(/\.(png|webp|jpg|mp4|woff2|zip|dmg)$/i.test(source)) });
const server = await createPreviewServer({ root });
let browser;
try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}/?edit&platform=windows`;
    browser = await chromium.launch({ channel: process.env.CI ? undefined : 'chrome' });
    for (const width of [1440, 390] as const) {
        await cp(fileURLToPath(new URL('../site/index.html', import.meta.url)), path.join(root, 'index.html'));
        const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
        await page.route('https://api.github.com/**', route => route.fulfill({ json: [] }));
        await page.route('https://downloads.peach.video/releases.json', route => route.fulfill({ json: [], headers: { 'access-control-allow-origin': '*' } }));
        await page.route('https://img.shields.io/docker/v/**', route => route.fulfill({ json: { message: 'v7.8.9' }, headers: { 'access-control-allow-origin': '*' } }));
        const pixel = await sharp({ create: { width: 1, height: 1, channels: 4, background: '#18191a' } }).webp().toBuffer();
        await page.route('**/assets/films/*.webp', route => route.fulfill({ contentType: 'image/webp', body: pixel }));
        await page.route('**/assets/screenshots/**', route => route.fulfill({ contentType: 'image/webp', body: pixel }));
        await page.goto(base, { waitUntil: 'networkidle' });
        async function beginEdit(locator: Locator) {
            await locator.evaluate(element => element.scrollIntoView({ block: 'center' }));
            await locator.click({ trial: true });
            const point = await locator.evaluate((element: Node) => {
                const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
                for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                    if (!(node as Text).data.trim() || (node.parentElement!.closest('svg') as SVGSVGElement))
                        continue;
                    const range = document.createRange();
                    range.selectNodeContents(node);
                    const rect = range.getClientRects()[0];
                    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                }
                throw Error('编辑目标没有可见文字');
            });
            await page.mouse.click(point.x, point.y);
            const box = page.locator('.__ee,.__ei');
            try {
                await box.waitFor({ timeout: 5000 });
            }
            catch (error) {
                console.error(await page.evaluate(point => ({ point, hit: document.elementFromPoint(point.x, point.y)?.outerHTML,
                    status: document.querySelector('[data-copy-toolbar-host]')?.shadowRoot?.querySelector('[role="status"]')?.textContent, caret: document.caretRangeFromPoint(point.x, point.y)?.startContainer?.textContent }), point));
                throw error;
            }
            return box;
        }
        async function edit(locator: Locator, text: string) {
            const box = await beginEdit(locator);
            await box.fill(text);
            await box.press('Enter');
            await page.waitForFunction(() => /已保存|已删除/.test(document.querySelector('[data-copy-toolbar-host]')?.shadowRoot?.querySelector('[role="status"]')?.textContent || ''));
        }
        const mac = page.locator('[data-platform-option="macos"]');
        const docker = page.locator('[data-platform-option="docker"]');
        const sentence = page.locator('.say.lg .sub').nth(2);
        await edit(sentence, `Peach 是你的个人资源管理库 ${width}。`);
        assert.equal(await sentence.innerText(), `Peach 是你的个人资源管理库 ${width}。`);
        await page.reload({ waitUntil: 'networkidle' });
        assert.equal(await sentence.innerText(), `Peach 是你的个人资源管理库 ${width}。`);
        await docker.click();
        const styled = page.locator('[data-download-panel="docker"] > p:has(code)');
        const fullText = await styled.innerText();
        await edit(styled, fullText.replace('/data', ''));
        assert.deepEqual(await styled.locator('code').allTextContents(), ['/media']);
        await page.reload({ waitUntil: 'networkidle' });
        await docker.click();
        assert.deepEqual(await styled.locator('code').allTextContents(), ['/media']);
        await mac.click();
        await page.locator('[data-download-panel="macos"]').waitFor({ state: 'visible' });
        await edit(page.locator('[data-macos-status]'), `Mac 文案 ${width}`);
        await docker.click();
        await page.locator('[data-download-panel="docker"]').waitFor({ state: 'visible' });
        const caption = page.locator('[data-download-caption]').first();
        await edit(caption, `Docker · v1.2.${width}`);
        await edit(page.locator('[data-download-panel="docker"] h3'), `Docker 部署 ${width}`);
        await mac.click();
        assert.equal(await page.locator('[data-macos-status]').innerText(), `Mac 文案 ${width}`);
        await edit(page.locator('[data-macos-status]'), '');
        assert.equal(await page.locator('[data-macos-status]').innerText(), '');
        await docker.click();
        const paragraph = page.locator('[data-download-panel="docker"] > p').first();
        await edit(paragraph, '');
        assert.equal(await paragraph.innerText(), '');
        await edit(page.locator('[data-download-panel="docker"] > p').last(), `删除后继续编辑 ${width}`);
        await page.reload({ waitUntil: 'networkidle' });
        await docker.click();
        assert.equal(await paragraph.innerText(), '');
        assert.equal(await page.locator('[data-download-panel="docker"] > p').last().innerText(), `删除后继续编辑 ${width}`);
        await docker.click();
        assert.equal(await caption.innerText(), `Docker · v1.2.${width}`);
        await page.reload({ waitUntil: 'networkidle' });
        await docker.click();
        assert.equal(await caption.innerText(), `Docker · v1.2.${width}`);
        assert.match(await page.locator('[data-download-panel="docker"] h3').innerText(), new RegExp(`Docker 部署 ${width}`));
        await mac.click();
        assert.equal(await page.locator('[data-macos-status]').innerText(), '');
        // 其他切换区也照常工作，切换后生成的导览标题仍能保存。
        await page.locator('.dock [data-k="people"]').click();
        await page.waitForFunction(() => (document.querySelector('.dock [data-k="people"]') as HTMLElement)?.getAttribute('aria-selected') === 'true');
        await edit(page.locator('#stage-say b'), `导览标题 ${width}`);
        await page.locator('.dock [data-k="home"]').click();
        await page.locator('.dock [data-k="people"]').click();
        assert.equal(await page.locator('#stage-say b').innerText(), `导览标题 ${width}`);
        await page.locator('.dock [data-k="home"]').click();
        await page.waitForFunction(() => (document.querySelector('.dock [data-k="home"]') as HTMLElement)?.getAttribute('aria-selected') === 'true');
        if (await page.locator('#stage-say .sub').count())
            await edit(page.locator('#stage-say .sub'), '');
        await docker.click();
        await edit(page.locator('[data-download-panel="docker"] > p').last(), `删除默认导览说明后继续 ${width}`);
        await page.reload({ waitUntil: 'networkidle' });
        await docker.click();
        assert.equal(await page.locator('[data-download-panel="docker"] > p').last().innerText(), `删除默认导览说明后继续 ${width}`);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const html = await readFile(path.join(root, 'index.html'), 'utf8');
        assert.match(html, /data-copy-overrides=/);
        assert.ok(html.includes(`Docker · v1.2.${width}`));
        const faq = page.locator('#faq details').last(), macParagraph = faq.locator('p');
        await faq.locator('summary').click();
        const originalMac = await macParagraph.innerText();
        await edit(macParagraph, '');
        assert.equal(await macParagraph.innerText(), '查看打开步骤');
        await page.reload({ waitUntil: 'networkidle' });
        const command = async (action: { (): Promise<void>; (): Promise<void>; (): Promise<void>; (): Promise<void>; (): any; }) => { const loaded = page.waitForEvent('load'); await action(); await loaded; await page.waitForLoadState('networkidle'); };
        await command(() => page.getByRole('button', { name: '撤销', exact: true }).click());
        await faq.locator('summary').click();
        assert.equal(await macParagraph.innerText(), originalMac);
        await command(() => page.keyboard.press('Control+Shift+Z'));
        assert.equal(await macParagraph.innerText(), '查看打开步骤');
        await command(() => page.keyboard.press('Control+Z'));
        assert.equal(await macParagraph.innerText(), originalMac);
        // 未保存输入用原生撤销；弹窗按钮仍保持普通点击可用。
        const input = await beginEdit(macParagraph);
        const beforeInput = await input.innerText();
        await input.press('End');
        await page.keyboard.type('临时输入');
        const typed = await input.innerText();
        await input.press('Control+Z');
        const inputUndone = await input.innerText();
        assert.ok(inputUndone.startsWith(beforeInput) && inputUndone.length < typed.length, '未保存输入按浏览器原生粒度撤销');
        await input.press('Escape');
        await faq.locator('[data-mac-help]').click();
        const dialog = page.locator('[data-mac-help-dialog]');
        await dialog.waitFor({ state: 'visible' });
        const note = dialog.locator('p.note').first(), originalNote = await note.innerText();
        await edit(note, `弹窗说明 ${width}`);
        assert.equal(await note.innerText(), `弹窗说明 ${width}`);
        await command(() => dialog.getByRole('button', { name: '撤销', exact: true }).click());
        await dialog.waitFor({ state: 'visible' });
        assert.equal(await note.innerText(), originalNote);
        await dialog.getByRole('button', { name: '知道了', exact: true }).click();
        await dialog.waitFor({ state: 'hidden' });
        assert.equal(await page.locator('[data-copy-bar]').isVisible(), true);
        console.log(`PASS ${width}: 编辑保存、整段误删撤销、重做、原生输入撤销、弹窗打开编辑与撤销`);
        await page.close();
    }
}
finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
}
