import assert from 'node:assert/strict';
import {chromium} from 'playwright';

const base=process.argv[2]??'http://127.0.0.1:8795/';
const browser=await chromium.launch();
try {
  for(const width of [390,1440])for(const language of ['zh-CN','en']) {
    const page=await browser.newPage({viewport:{width,height:844},locale:language}),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.route('https://api.github.com/**',r=>r.fulfill({json:[]}));
    await page.route('https://downloads.peach.video/releases.json',r=>r.fulfill({json:[]}));
    await page.route('https://img.shields.io/**',r=>r.fulfill({json:{message:'v1.2.3'}}));
    try {
      await page.goto(new URL(language==='en'?'/en/':'/',base).href,{waitUntil:'networkidle'});
      assert.equal(await page.locator('html').getAttribute('lang'),language,'直接地址决定页面语言');
      assert.equal(await page.locator('.mk-cursor').count(),0,'离屏卡片不创建播放光标');
      await page.locator('.lang-menu button').click();
      assert.equal(await page.locator('.lang-list').isVisible(),true);
      const selected=await page.locator(`.lang-list a[lang="${language}"]`).evaluate(el=>{const s=getComputedStyle(el,'::after');return {content:s.content,width:s.width,mask:s.maskImage}});
      assert.equal(selected.width,'14px','当前语言显示图形勾号');
      assert.match(selected.mask,/data:image\/svg/);
      await page.keyboard.press('Escape');
      assert.equal(await page.locator('.lang-list').isVisible(),false);
      const faq=page.locator('#faq details').first();
      await faq.locator('summary').click();
      await page.waitForFunction(()=>document.querySelector('#faq details').getAnimations().length===0);
      assert.equal(await faq.getAttribute('open'),'');
      assert.ok((await faq.locator('p').innerText()).length>0,'问答内容可见');
      await faq.locator('summary').click();
      await page.waitForFunction(()=>!document.querySelector('#faq details').open);
      // 首次可见才初始化；离屏不继续改写内容，重新进入可续播。
      const card=page.locator('.live[data-mock="feed"]');
      await card.scrollIntoViewIfNeeded();
      await card.locator('.mk-cursor').waitFor({state:'visible'});
      const scale=await card.locator('.live-screen').evaluate(el=>({width:el.clientWidth,scale:Number(el.querySelector('.mk').style.getPropertyValue('--mk-s'))}));
      assert.ok(Math.abs(scale.width/720-scale.scale)<.01,'画面按实际卡片宽度缩放');
      await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
      await page.waitForTimeout(1200);
      const paused=await card.locator('.mk-win').innerHTML();
      await page.waitForTimeout(600);
      assert.equal(await card.locator('.mk-win').innerHTML(),paused,'离屏暂停内容变动');
      await page.setViewportSize({width:width===390?1440:390,height:844});
      await card.scrollIntoViewIfNeeded();
      await page.waitForFunction(()=>{const s=document.querySelector('.live[data-mock="feed"] .live-screen');return Math.abs(s.clientWidth/720-Number(s.querySelector('.mk').style.getPropertyValue('--mk-s')))<.01});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'无横向溢出');
      assert.deepEqual(errors,[]);
      console.log(`PASS 界面 ${language} ${width}: 语言菜单、问答、离屏暂停与缩放`);
    } finally {await page.close()}
  }
  const page=await browser.newPage({viewport:{width:390,height:844},locale:'zh-CN',reducedMotion:'reduce'});
  try {
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('.live[data-mock="feed"]').scrollIntoViewIfNeeded();
    assert.equal(await page.locator('.mk-cursor').count(),0,'减少动态效果保留静态画面');
    await page.locator('#faq details:last-child summary').click();
    assert.equal(await page.locator('#faq details:last-child').evaluate(el=>el.open),true);
    console.log('PASS 减少动态效果：静态卡片与问答可用');
  } finally {await page.close()}
} finally {await browser.close()}
