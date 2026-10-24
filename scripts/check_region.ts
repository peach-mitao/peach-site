import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const base = process.argv[2];
if (!base) throw Error('请指定站点地址');
const out = new URL('../evidence/region/', import.meta.url);
await mkdir(out, {recursive: true});
const browser = await chromium.launch({channel: 'chrome'});
const report: unknown[] = [];
try {
  for (const width of [1440, 390]) for (const colorScheme of ['light', 'dark'] as const) {
    const context = await browser.newContext({viewport: {width, height: 844}, colorScheme});
    const page = await context.newPage(), errors: string[] = [], failed: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('requestfailed', request => failed.push(request.url()));
    page.on('response', response => {if (response.status() >= 400 && new URL(response.url()).pathname !== '/unavailable') failed.push(`${response.status()} ${response.url()}`);});
    const response = await page.goto(new URL('/unavailable', base).href, {waitUntil: 'networkidle'});
    assert.equal(response?.status(), 403);
    assert.equal(response?.headers()['cache-control'], 'private, no-store');
    assert.equal(await page.locator('h1').textContent(), '不提供服务');
    assert.equal(await page.locator('html').evaluate(element => element.classList.contains('dark')), colorScheme === 'dark');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    assert.equal(await page.locator('img').evaluate(image => (image as HTMLImageElement).naturalWidth > 0), true);
    const geometry = await page.locator('section').evaluate(element => ({width: element.getBoundingClientRect().width, radius: getComputedStyle(element).borderRadius, background: getComputedStyle(element).backgroundColor}));
    assert.ok(geometry.width > 300 && geometry.width <= 560);
    assert.deepEqual(errors, []); assert.deepEqual(failed, []);
    await page.screenshot({path: new URL(`${width}-${colorScheme}.png`, out).pathname.replace(/^\/([A-Z]:)/, '$1'), fullPage: true});
    report.push({width, colorScheme, status: response?.status(), geometry, errors, failed});
    await context.close();
  }
  await writeFile(new URL('report.json', out), JSON.stringify({base, passed: true, cases: report}, null, 2));
  console.log(JSON.stringify({base, passed: true, cases: report}));
} finally {await browser.close();}
