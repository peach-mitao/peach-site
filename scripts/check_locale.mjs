import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:8795/';
const browser=await chromium.launch();
async function context(options={}){
  const ctx=await browser.newContext({locale:'en-US',...options});
  await ctx.route('https://api.github.com/**',r=>r.fulfill({json:[]}));
  await ctx.route('https://downloads.peach.video/releases.json',r=>r.fulfill({json:[]}));
  await ctx.route('https://img.shields.io/**',r=>r.fulfill({json:{message:'v1.2.3'}}));
  return ctx;
}
try{
  for(const [languages,expected] of [[['zh-CN'],'zh-CN'],[['en-US'],'en'],[['ja-JP'],'en'],[['ja','zh-TW','en'],'zh-CN']]){
    const ctx=await context();
    try{
      await ctx.addInitScript(languages=>Object.defineProperty(navigator,'languages',{get:()=>languages}),languages);
      const page=await ctx.newPage();await page.goto(base,{waitUntil:'networkidle'});
      assert.equal(await page.locator('html').getAttribute('lang'),expected);
      console.log(`PASS 自动语言 ${languages.join(',')} → ${expected}`);
    }finally{await ctx.close()}
  }
  const ctx=await context();
  try{
    const events=[];
    await ctx.route('**/api/event',r=>{events.push(JSON.parse(r.request().postData()));return r.fulfill({status:204})});
    const page=await ctx.newPage();
    await page.goto(new URL('/?utm_source=locale-check#download',base).href,{referer:'https://example.com/from',waitUntil:'networkidle'});
    assert.equal(new URL(page.url()).pathname,'/en/');assert.equal(new URL(page.url()).hash,'#download');
    const views=events.filter(e=>e.event==='pageview');assert.equal(views.length,1,'自动跳转只记最终页面');
    assert.equal(views[0].referrer,'example.com');assert.equal(views[0].utm,'locale-check');
    await page.locator('footer a[lang="zh-CN"]').click();await page.waitForURL(url=>url.pathname==='/');
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    await page.goto(new URL('/en/',base).href,{waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.goto(new URL('/?edit',base).href,{waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    console.log('PASS 手动选择持久化、英文直链、编辑模式、推广来源与单次访问埋点');
  }finally{await ctx.close()}
  const blocked=await context();
  try{
    await blocked.addInitScript(()=>Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}}));
    const page=await blocked.newPage();await page.goto(new URL('/en/',base).href,{waitUntil:'networkidle'});
    await page.locator('footer a[lang="zh-CN"]').click();await page.waitForURL(url=>url.searchParams.get('lang')==='zh');
    await page.reload({waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');
    console.log('PASS 禁止本地存储时手动中文入口可用，刷新不反跳');
  }finally{await blocked.close()}
  const noJS=await context({javaScriptEnabled:false});
  try{const page=await noJS.newPage();await page.goto(base);assert.equal(await page.locator('html').getAttribute('lang'),'zh-CN');console.log('PASS 无 JavaScript 保留中文静态页面')}finally{await noJS.close()}
}finally{await browser.close()}
