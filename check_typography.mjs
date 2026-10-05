import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {chromium} from 'playwright';

const base = process.argv[2] ?? 'http://127.0.0.1:8792/';
const captureOnly = process.argv.includes('--capture-only');
const outIndex = process.argv.indexOf('--out');
const out = path.resolve(outIndex >= 0 ? process.argv[outIndex + 1] : 'evidence/typography/after');
await mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome'});
const report = [];
try {
  for (const width of [1280, 390, 320, 768]) {
    const context = await browser.newContext({viewport:{width,height:width <= 390 ? 844 : 900}, locale:'zh-CN', reducedMotion:'reduce'});
    try {
      const page = await context.newPage();
      const errors = [], failures = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('response', response => {if(response.status() >= 400) failures.push(response.url());});
      await page.goto(base, {waitUntil:'networkidle'});
      await page.evaluate(() => document.fonts.ready);
      await page.locator('.hello').waitFor();
      const metrics = await page.evaluate(() => {
        const h = document.querySelector('h1');
        const style = getComputedStyle(h);
        const words = [...h.querySelectorAll('.nowrap')].map(el => {
          const range = document.createRange(); range.selectNodeContents(el.firstChild);
          const rects = [...range.getClientRects()].filter(r => r.width > 0);
          return {text:el.textContent, lines:[...new Set(rects.map(r => Math.round(r.top)))].length, width:el.getBoundingClientRect().width};
        });
        const punctuation = h.querySelector('.punct');
        const sticker = document.querySelector('.stk-layer');
        return {width:innerWidth, scrollWidth:document.documentElement.scrollWidth, text:h.textContent,
          fontSize:parseFloat(style.fontSize), letterSpacing:style.letterSpacing, words,
          punctuationWidth:punctuation?.getBoundingClientRect().width,
          punctuationPosition:punctuation && getComputedStyle(punctuation).position,
          stickersVisible:sticker && getComputedStyle(sticker).display !== 'none',
          heroHeight:h.getBoundingClientRect().height};
      });
      if(!captureOnly) {
        assert.equal(metrics.text, '所有片子，放进一处');
        assert.equal(metrics.letterSpacing, 'normal');
        assert.ok(metrics.scrollWidth <= width, `横向溢出：${width}`);
        assert.equal(metrics.words.length, 2);
        assert.ok(metrics.words.every(word => word.lines === 1), '标题短语完整');
        const captionPhrases = await page.locator('.hero .say .nowrap').evaluateAll(nodes => nodes.map(node => {
          const range = document.createRange(); range.selectNodeContents(node);
          return [...new Set([...range.getClientRects()].map(r => Math.round(r.top)))].length;
        }));
        assert.deepEqual(captionPhrases, [1,1,1], '首屏说明按完整短语换行');
        assert.ok(Math.abs(metrics.punctuationWidth - metrics.fontSize * .6) < 1, '标题标点宽度');
        if(width <= 560) {
          assert.equal(metrics.punctuationPosition, 'absolute', '行末标点不参与标题居中');
          assert.ok(!metrics.stickersVisible, '手机阅读区无贴纸遮挡');
          assert.ok(metrics.heroHeight > metrics.fontSize * 2, '手机标题为两行');
        }
        assert.deepEqual(errors, []);
        assert.deepEqual(failures, []);
        const actions = await page.locator('.hero .cta').evaluate(el => {
          const primary=el.querySelector('.btn-primary'),secondary=[...el.querySelectorAll('.cta-secondary .btn')];
          return {primary:primary.getBoundingClientRect().toJSON(),href:primary.href,text:primary.textContent.trim(),
            secondary:secondary.map(button=>button.getBoundingClientRect().toJSON())};
        });
        assert.ok(actions.href.endsWith('/peach/releases'));
        assert.equal(actions.text,'下载 Windows 版');
        assert.equal(actions.secondary.length,2);
        assert.ok(actions.secondary.every(button=>button.top>actions.primary.bottom),'下载位于次级动作上方');
        assert.ok(Math.abs(actions.secondary[0].top-actions.secondary[1].top)<1,'次级动作同排');
        assert.ok(actions.secondary.every(button=>button.left>=0&&button.right<=width),'动作位于视口内');
        const footer = await page.locator('.final footer').evaluate(el=>{
          const links=[...el.querySelectorAll('a')];
          return {top:el.getBoundingClientRect().top,previousBottom:el.previousElementSibling.getBoundingClientRect().bottom,
            color:getComputedStyle(el).color,links:links.map(link=>({height:link.getBoundingClientRect().height,width:link.getBoundingClientRect().width}))};
        });
        assert.ok(footer.top>footer.previousBottom,'页脚不覆盖收尾动作');
        assert.equal(footer.color,'rgb(201, 205, 212)');
        assert.ok(footer.links.every(link=>link.height>=44&&link.width<=width),'页脚链接可触达且不溢出');
      }
      if(width === 1280 || width === 390) {
        await page.screenshot({path:path.join(out, `home-${width}.png`)});
        await page.locator('h1').screenshot({path:path.join(out, `title-${width}.png`)});
        await page.locator('.final footer').screenshot({path:path.join(out, `footer-${width}.png`)});
        await page.locator('.windows-download').screenshot({path:path.join(out, `download-${width}.png`)});
      }
      report.push({...metrics,errors,failures});
      console.log(`${captureOnly ? 'CAPTURE' : 'PASS'} ${width}: 字距、标点、完整短语、视口`);
    } finally {await context.close();}
  }
  // 桌面加载过贴纸后缩窄窗口，阅读区仍保持完整。
  if(!captureOnly) {
    const page = await browser.newPage({viewport:{width:1280,height:900}, reducedMotion:'reduce'});
    try {
      await page.goto(base, {waitUntil:'networkidle'});
      await page.locator('.stk.on').first().waitFor({state:'visible'});
      await page.setViewportSize({width:390,height:844});
      assert.equal(await page.locator('.stk-layer').isVisible(), false);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      console.log('PASS resize: 桌面贴纸不遮挡手机文字');
    } finally {await page.close();}
  }
} finally {
  await browser.close();
  await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
}
