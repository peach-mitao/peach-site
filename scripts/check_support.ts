import assert from 'node:assert/strict';
import {chromium,type Locator,type Page} from 'playwright';
const base=process.argv[2];if(!base)throw Error('请指定本地支持页预览地址');
const demo=process.argv.includes('--demo'),browser=await chromium.launch({channel:'chrome'});
async function beginEdit(page:Page,heading:Locator){
 const point=await heading.evaluate(element=>{const range=document.createRange();range.selectNodeContents(element);const box=range.getClientRects()[0];return {x:box.left+Math.min(12,box.width/2),y:box.top+box.height/2}});
 await page.mouse.click(point.x,point.y);return page.locator(demo?'[data-copy-inline]':'.__ee,.__ei');
}
try{
 for(const width of [1440,390])for(const locale of ['zh-CN','en-US']){
  const context=await browser.newContext({viewport:{width,height:844},locale,colorScheme:locale==='en-US'?'light':'dark'}),page=await context.newPage(),errors:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(new URL('/missing-support?edit',base).href,{waitUntil:'networkidle'});
  assert.equal(response?.status(),404);assert.equal(await page.locator('html').getAttribute('lang'),locale==='zh-CN'?'zh-CN':'en');
  assert.equal(await page.locator('h1').textContent(),locale==='zh-CN'?'四〇四':'404');
  assert.equal(await page.locator('h1').count(),1);
  assert.equal(await page.locator('html').evaluate(element=>element.classList.contains('dark')),locale==='zh-CN');
  const home=page.locator('[data-not-found-home]');assert.equal(await home.getAttribute('href'),locale==='en-US'&&!demo?'/en/':'/');
  const script=await page.request.get(new URL(demo?'/assets/support-ui/page-support.js':'/assets/page-support.js',base).href);assert.equal(script.status(),200);assert.match(script.headers()['content-type'],/javascript/);
  if(locale==='zh-CN'){const editor=await beginEdit(page,page.locator('h1'));await editor.fill('临时文字');await editor.press('Escape');assert.equal(await page.locator('h1').textContent(),'四〇四')}
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS ${demo?'demo':'site'} ${width} ${locale}: 404、主题、单语言、资源类型、编辑取消与布局`);
 }
 for(const [locale,saved,query,expected] of [['en-US','zh','','zh-CN'],['zh-CN','en','','en'],['en-US','en','?lang=zh','zh-CN']] as const){
  const context=await browser.newContext({locale}),page=await context.newPage();await context.addInitScript(value=>localStorage.setItem('peach.site.locale',value),saved);
  await page.goto(new URL('/missing-support'+query,base).href,{waitUntil:'networkidle'});assert.equal(await page.locator('html').getAttribute('lang'),expected);await context.close();
 }
 if(!demo)for(const width of [1440,390])for(const locale of ['zh-CN','en-US']){
  const context=await browser.newContext({viewport:{width,height:844},locale}),page=await context.newPage(),sent:string[]=[];
  await page.route('**/api/behavior',route=>route.fulfill({status:204}));
  page.on('request',request=>{if(request.method()==='POST'&&!request.url().endsWith('/api/behavior'))sent.push(request.url())});
  await page.goto(new URL('/copyright/',base).href,{waitUntil:'networkidle'});assert.equal(new URL(page.url()).pathname,locale==='en-US'?'/en/copyright/':'/copyright/');
  for(const [name,value] of Object.entries({claimant:'Preview tester',reply:'preview@example.test',contact:'Synthetic contact',work:'Synthetic work',urls:'https://example.test/work',signature:'Preview tester'}))await page.locator(`[name="${name}"]`).fill(value);
  await page.locator('[name=goodFaith]').check();await page.locator('[name=accuracy]').check();await page.locator('#prepare').click();
  await page.locator('#result').waitFor({state:'visible'});assert.match(await page.locator('#notice').inputValue(),/Synthetic work/);assert.match(await page.locator('#compose').getAttribute('href')||'',/^mailto:dmca@peach.video\?/);assert.deepEqual(sent,[]);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await context.close();console.log(`PASS copyright ${width} ${locale}: 自动版本、表单整理与无外发`);
 }
 if(!demo)for(const width of [320,1025])for(const language of ['zh-CN','en']){
  const context=await browser.newContext({viewport:{width,height:844},locale:language,colorScheme:language==='en'?'light':'dark'}),page=await context.newPage();
  const prefix=language==='en'?'/en':'';
  for(const route of ['/credits/','/copyright/']){
   await page.goto(new URL(prefix+route+'?edit',base).href,{waitUntil:'networkidle'});
   const title=await page.locator('h1').innerText(),editor=await beginEdit(page,page.locator('h1'));
   await editor.fill('临时标题');await editor.press('Escape');assert.equal(await page.locator('h1').innerText(),title);
   const arrows=await page.locator('.support-document a[href^="http"]').evaluateAll(links=>links.map(link=>getComputedStyle(link,'::after').maskImage));
   assert.ok(arrows.length>0);assert.ok(arrows.every(mask=>mask.includes('data:image/svg')),'外链均显示图形标识');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   if(route==='/credits/'){
    const sizes=await page.evaluate(()=>['h1','h2','h3','p'].map(selector=>parseFloat(getComputedStyle(document.querySelector('.support-document '+selector)!).fontSize)));
    assert.ok(sizes[0]>sizes[1]&&sizes[1]>sizes[2]&&sizes[2]>sizes[3],'来源页面标题层级清楚');
   }
  }
  await context.close();console.log(`PASS 支持页 ${width} ${language}: 层级、外链、编辑取消与布局`);
 }
}finally{await browser.close()}
