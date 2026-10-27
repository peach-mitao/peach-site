import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium,type Page} from 'playwright';
import {createPreviewServer} from './serve.ts';
import {behaviorRequest} from '../worker/behavior.ts';
import {behaviorStorage} from './behavior_storage.ts';

interface Paint{box:number[];background:string;color:string;radius:string;text:string}
declare global{interface Window{supportFrames:Paint[][];supportFramesDone:boolean}}
type PaintWindow=Window;
async function measure(page:Page,selectors:string[],sample=false){
 return page.evaluate(({selectors,sample})=>{
  const read=()=>selectors.map(selector=>{
   const element=document.querySelector<HTMLElement>(selector)!;
   if(!element)return {box:[0,0,0,0],background:'missing',color:'missing',radius:'missing',text:'missing'};
   const box=element.getBoundingClientRect(),style=getComputedStyle(element);
   return {box:[box.x,box.y,box.width,box.height],background:style.backgroundColor,color:style.color,radius:style.borderRadius,text:element.textContent!.trim()};
  });
  const value=read();
  if(sample){const own=window as PaintWindow;own.supportFrames=[];own.supportFramesDone=false;const frame=()=>{if(own.supportFramesDone)return;own.supportFrames.push(read());requestAnimationFrame(frame)};requestAnimationFrame(frame)}
  return value;
 },{selectors,sample});
}
function equalPaint(before:Paint[],after:Paint[],label:string){
 assert.equal(after.length,before.length,label);
 before.forEach((value,index)=>{
  const actual=after[index];
  assert.deepEqual({...actual,box:[]},{...value,box:[]},`${label} 控件外观`);
  value.box.forEach((number,axis)=>assert.ok(Math.abs(number-actual.box[axis])<=1,`${label} 几何 ${index}/${axis}: ${number} → ${actual.box[axis]}`));
 });
}
const {database,sqlite}=behaviorStorage(':memory:');
const server=await createPreviewServer({async dynamic(req,res){
 const url=new URL(req.url||'/','http://127.0.0.1');
 if(url.pathname!=='/privacy/analytics'&&!url.pathname.startsWith('/analytics'))return false;
 const response=await behaviorRequest(new Request(url),{BEHAVIOR:database,BEHAVIOR_PREVIEW:'1'});
 assert.ok(response);res.writeHead(response.status,Object.fromEntries(response.headers)).end(await response.text());return true;
}});
server.listen(0,'127.0.0.1');await once(server,'listening');
const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`,browser=await chromium.launch({channel:process.env.CI?undefined:'chrome'});
try{
 for(const width of [390,1440])for(const scheme of ['dark','light'] as const){
  for(const language of ['zh','en'])for(const off of [false,true]){
   const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,locale:language==='zh'?'en-US':'zh-CN',reducedMotion:'reduce'}),page=await context.newPage(),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   if(off)await context.addCookies([{name:'peach_analytics_off',value:'1',url:base}]);
   let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve});
   await page.route('**/assets/boardui.js',async route=>{await pending;await route.continue()});
   try{
    await page.goto(`${base}/privacy/analytics?lang=${language}`,{waitUntil:'commit'});
    await page.locator('.privacy-state-note').waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'),language==='zh'?'zh-CN':'en');
    assert.equal(await page.locator(off?'#analytics-on':'#analytics-off').isVisible(),true);
    const selectors=['#privacy-controls','.privacy-state-note',off?'#analytics-on':'#analytics-off','#privacy-controls nav'];
    const before=await measure(page,selectors,true);release();await page.waitForLoadState('networkidle');
    equalPaint(before,await measure(page,selectors),`privacy ${width}/${scheme}/${language}/${off}`);
    const frames=await page.evaluate(()=>{const own=window as PaintWindow;own.supportFramesDone=true;return own.supportFrames});
    assert.ok(frames.length);for(const frame of frames)equalPaint(before,frame,'privacy 中间帧');
    assert.deepEqual(errors,[]);
   }finally{release();await context.close()}
  }
  const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,reducedMotion:'reduce'}),page=await context.newPage();
  let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve});
  await page.route('**/assets/behavior-dashboard.js',async route=>{await pending;await route.continue()});
  try{
   await page.goto(base+'/analytics/',{waitUntil:'commit'});await page.getByRole('combobox').first().waitFor();await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('[role="combobox"]').count(),6);
   assert.equal(await page.getByRole('combobox').count(),5);
   const selectors=['#filters',...['site','days','viewport','page','lang'].map(name=>`label:has(select[name="${name}"]) .select-island`),'.header-actions'];
   const before=await measure(page,selectors,true);release();await page.waitForLoadState('networkidle');
   equalPaint(before,await measure(page,selectors),'analytics 首帧');
   const frames=await page.evaluate(()=>{const own=window as PaintWindow;own.supportFramesDone=true;return own.supportFrames});
   for(const frame of frames)equalPaint(before,frame,'analytics 中间帧');
  }finally{release();await context.close()}
  for(const language of ['zh','en']){
   const context=await browser.newContext({viewport:{width,height:900},colorScheme:scheme,locale:'zh-CN'}),page=await context.newPage();
   let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve});
   await page.route('**/copyright/notice.js',async route=>{await pending;await route.continue()});
   try{
    await page.goto(`${base}${language==='en'?'/en':''}/copyright/?lang=${language}`,{waitUntil:'commit'});await page.locator('#contact').waitFor();await page.evaluate(()=>document.fonts.ready);
    assert.equal(await page.locator('#email').getAttribute('href'),'mailto:dmca@peach.video');
    assert.equal(await page.locator('#prepare').isDisabled(),true);
    const selectors=['.support-document','#contact','#prepare'],before=await measure(page,selectors,true);release();await page.waitForLoadState('networkidle');
    assert.equal(await page.locator('#prepare').isEnabled(),true);equalPaint(before,await measure(page,selectors),'copyright 首帧');
    const frames=await page.evaluate(()=>{const own=window as PaintWindow;own.supportFramesDone=true;return own.supportFrames});for(const frame of frames)equalPaint(before,frame,'copyright 中间帧');
   }finally{release();await context.close()}
  }
  console.log(`PASS 首帧及中间帧 ${width}/${scheme}：统计偏好双语言与两种 Cookie 状态、后台筛选器、版权页`);
 }
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));sqlite.close()}
