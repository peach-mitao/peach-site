import assert from 'node:assert/strict';
import { chromium } from 'playwright';
// 在真实页面上逐个触发埋点，核对请求内容与 204 响应。无头浏览器的 UA 被 Worker 识别为自动化访问，
// 线上运行只验证链路，不写入统计。
const base = process.argv[2] ?? 'http://127.0.0.1:8794/';
const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'zh-CN', reducedMotion: 'reduce' });
    const events: any[] = [];
    // 在浏览器上下文层转发并记录：点击链接跳页后，旧页面发出的埋点照样记得到。
    await context.route(url => url.pathname === '/api/event', async (route) => {
        const response = await route.fetch();
        events.push({ ...JSON.parse(route.request().postData() ?? '{}'), status: response.status() });
        await route.fulfill({ response });
    });
    const page = await context.newPage();
    const next = async (event: string, detail: string|undefined = undefined, match: (item:Record<string,any>)=>boolean = () => true) => {
        for (let i = 0; i < 100; i++) {
            const found = events.find(item => item.event === event && (detail === undefined || item.detail === detail) && match(item));
            if (found)
                return found;
            await page.waitForTimeout(50);
        }
        assert.fail(`未收到 ${event} ${detail ?? ''} 埋点，已收到 ${JSON.stringify(events)}`);
    };
    await page.goto(new URL('/', base).href);
    const home = await next('pageview');
    assert.deepEqual([home.lang, home.path, home.referrer, home.status], ['zh-CN', '/', '', 204]);
    await page.locator('[data-platform-option="macos"]').click();
    assert.equal((await next('platform', 'macos')).status, 204);
    await page.locator('#faq summary').first().click();
    assert.equal((await next('faq', '1')).status, 204);
    await page.locator('[data-mac-help]').filter({ visible: true }).first().click();
    assert.equal((await next('mac_help')).status, 204);
    await page.evaluate(() => (document.querySelector('[data-mac-help-dialog]') as HTMLDialogElement).close());
    await page.locator('footer a[lang="en"]').click();
    assert.equal((await next('lang_switch', 'en')).status, 204);
    await page.waitForURL(/\/en\/$/);
    const english = await next('pageview', undefined, item => item.lang === 'en');
    assert.deepEqual([english.path, english.referrer, english.status], ['/en/', new URL(base).hostname, 204]);
    console.log(`PASS 埋点：访问、平台切换、常见问题、Mac 打开步骤、语言切换，共 ${events.length} 条，均返回 204`);
}
finally {
    await browser.close();
}
