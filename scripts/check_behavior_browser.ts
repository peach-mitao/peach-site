import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createPreviewServer} from './serve.ts';
import {behaviorStorage} from './behavior_storage.ts';
import {behaviorRequest} from '../worker/behavior.ts';
import type {Batch} from '../browser/assets/behavior-contract.ts';

const batches:Batch[]=[],{database,sqlite}=behaviorStorage(':memory:');
const fixture=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>body{margin:0}section{padding:20px}button{width:160px;height:40px}.cover{position:fixed;inset:0;background:#111;z-index:10}#outside{display:block;margin-top:1200px}</style></head><body><section id="region"><button id="action">执行操作</button><button id="unknown">未登记操作</button><input id="private" aria-label="测试输入"><a id="download" href="/sample.dmg">下载文件</a><a id="jump" href="#outside">前往下载区</a><button id="outside">页面底部操作</button></section><script type="module">import {startBehavior} from '/assets/behavior-core.js';startBehavior({site:'site',layout:'${'a'.repeat(64)}',preview:true,endpoint:location.pathname==='/behavior-chain'?'/api/behavior':'/record',rules:[{id:'region.content',label:'内容',selector:'#region',region:true},{id:'action.run',label:'操作',selector:'#action'},{id:'field.input',label:'输入',selector:'#private'},{id:'download.file',label:'下载',selector:'#download'},{id:'download.jump',label:'下载区',selector:'#jump'},{id:'action.outside',label:'底部操作',selector:'#outside'}]});</script></body></html>`;
const server=await createPreviewServer({async dynamic(req,res){
 const url=new URL(req.url||'/','http://127.0.0.1');
 if(url.pathname.startsWith('/behavior-')){res.writeHead(200,{'content-type':'text/html; charset=utf-8'}).end(url.pathname==='/behavior-copy'?fixture.replace("selector:'#action'","selector:'#action',text:'执行操作'"):fixture);return true}
 if(url.pathname==='/record'){
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);batches.push(JSON.parse(Buffer.concat(chunks).toString('utf8')));res.writeHead(204).end();return true;
 }
 if(url.pathname==='/api/behavior'||url.pathname.startsWith('/analytics')||url.pathname==='/privacy/analytics'){
  const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(chunk);
  const request=new Request(`http://127.0.0.1:${port}${req.url}`,{method:req.method,headers:new Headers(Object.entries(req.headers).filter((row):row is [string,string]=>typeof row[1]==='string')),body:chunks.length?Buffer.concat(chunks):undefined});
  const response=await behaviorRequest(request,{BEHAVIOR:database,BEHAVIOR_PREVIEW:'1'});
  assert.ok(response);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return true;
 }
 return false;
}});
server.listen(0,'127.0.0.1');await once(server,'listening');
const {port}=server.address() as {port:number},base=`http://127.0.0.1:${port}`,browser=await chromium.launch({channel:'chrome'});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors:string[]=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base+'/behavior-sdk');await page.waitForFunction(()=>window.PeachBehavior!==undefined);
 for(let attempt=0;attempt<50&&!batches.flatMap(b=>b.events).some(e=>e.kind==='exposure'&&e.target==='action.run');attempt++){await page.waitForTimeout(100);await page.evaluate(()=>window.PeachBehavior!.flush())}
 const initial=batches.flatMap(batch=>batch.events);assert.equal(initial.filter(e=>e.kind==='page').length,1);assert.ok(initial.some(e=>e.kind==='exposure'&&e.target==='action.run'),JSON.stringify({initial,errors}));assert.ok(!initial.some(e=>e.kind==='exposure'&&e.target==='action.outside'));
 await page.locator('#private').fill('secret search / token=PRIVATE');await page.locator('#action').click();await page.locator('#unknown').click();await page.evaluate(()=>window.PeachBehavior!.flush());
 assert.ok(batches.flatMap(b=>b.events).some(e=>e.kind==='unmapped'));assert.ok(!JSON.stringify(batches).includes('PRIVATE'));assert.ok(!JSON.stringify(batches).includes('secret search'));
 await page.evaluate(()=>history.pushState({},'','/behavior-next?search=PRIVATE'));await page.waitForTimeout(50);await page.evaluate(()=>window.PeachBehavior!.flush());
 const events=batches.flatMap(b=>b.events),lastPage=events.findLast(e=>e.kind==='page')!,leave=events.filter(e=>e.kind==='leave');assert.notEqual(lastPage.view,initial[0]!.view);assert.ok(leave.length);assert.equal(lastPage.page,'/');assert.ok(!JSON.stringify(batches).includes('search='));
 const shared='b'.repeat(32);await context.addCookies([{name:'peach_visit',value:shared,url:base}]);await page.locator('#action').click();await page.evaluate(()=>window.PeachBehavior!.flush());assert.equal(batches.at(-1)?.session,shared);assert.ok(batches.at(-1)?.events.some(e=>e.kind==='page'));
 await page.clock.install();await page.clock.setSystemTime(new Date(Date.now()+31*60000));await context.clearCookies({name:'peach_visit'});await page.locator('#action').click();await page.evaluate(()=>window.PeachBehavior!.flush());assert.notEqual(batches.at(-1)?.session,shared);assert.ok(batches.at(-1)?.events.some(e=>e.kind==='page'));await page.clock.resume();
 const count=batches.length;await page.waitForTimeout(11000);const idleCount=batches.length;await page.waitForTimeout(11000);assert.equal(batches.length,idleCount);assert.ok(idleCount<=count+1);
 await page.evaluate(()=>window.PeachBehavior!.stop());await page.locator('#action').click();await page.waitForTimeout(1100);assert.equal(batches.length,idleCount);
 await context.close();console.log('PASS SDK：曝光、未知控件、输入隔离、SPA 页面、静置和停止');

 const copy=await browser.newContext(),copyPage=await copy.newPage();await copyPage.goto(base+'/behavior-copy');await copyPage.waitForFunction(()=>document.querySelector<HTMLElement>('#action')?.dataset.behaviorTarget==='action.run');
 await copyPage.evaluate(()=>{document.querySelector('#action')!.firstChild!.textContent='未知的新文案'});await copyPage.waitForFunction(()=>!document.querySelector<HTMLElement>('#action')?.dataset.behaviorTarget);await copyPage.locator('#action').click();await copyPage.evaluate(()=>window.PeachBehavior!.flush());assert.ok(batches.at(-1)?.events.some(e=>e.kind==='unmapped'));await copy.close();console.log('PASS SDK：静态文案变更移除过期映射并报告未知控件');

 const covered=await browser.newContext(),coveredPage=await covered.newPage();await coveredPage.addInitScript(()=>document.addEventListener('DOMContentLoaded',()=>{const div=document.createElement('div');div.className='cover';document.body.append(div)}));
 const before=batches.length;await coveredPage.goto(base+'/behavior-covered');await coveredPage.waitForTimeout(1300);await coveredPage.evaluate(()=>window.PeachBehavior!.flush());assert.ok(!batches.slice(before).flatMap(b=>b.events).some(e=>e.kind==='exposure'));await covered.close();console.log('PASS SDK：遮挡区域不计曝光');

 for(const mode of ['edit','behavior-capture','optout']){
  const own=await browser.newContext();if(mode==='optout')await own.addCookies([{name:'peach_analytics_off',value:'1',url:base}]);
  const ownPage=await own.newPage(),before=batches.length;await ownPage.goto(base+'/behavior-excluded?'+(mode==='optout'?'':mode+'=1'));await ownPage.waitForTimeout(1200);await ownPage.evaluate(()=>window.PeachBehavior?.flush());assert.equal(batches.length,before);assert.equal((await own.cookies()).some(c=>c.name==='peach_visit'),false);await own.close();
 }
 console.log('PASS SDK：编辑、截图和停用均不采集');

 const chain=await browser.newContext(),chainPage=await chain.newPage();await chainPage.goto(base+'/behavior-chain');await chainPage.waitForFunction(()=>window.PeachBehavior!==undefined);await chainPage.locator('#action').click();await chainPage.evaluate(()=>window.PeachBehavior!.flush());
 assert.ok(Number(sqlite.prepare('SELECT COUNT(*) n FROM behavior_events').get()?.n)>0);
 for(const width of [1440,390]){
  await chainPage.setViewportSize({width,height:width===390?844:1000});await chainPage.goto(base+'/analytics/');await chainPage.waitForFunction(()=>document.querySelector('#status')?.textContent?.startsWith('更新于'));
  assert.equal(await chainPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.ok(await chainPage.locator('#targets tbody tr').count());
  await chainPage.getByRole('combobox',{name:'设备',exact:true}).click();await chainPage.getByRole('option',{name:'手机',exact:true}).click();await chainPage.waitForLoadState('networkidle');
  for(const name of ['访问动线','会话明细','点击热力图']){await chainPage.getByRole('tab',{name,exact:true}).click();await chainPage.waitForLoadState('networkidle');assert.equal(await chainPage.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
 }
 await chain.close();assert.deepEqual(errors,[]);console.log('PASS 浏览器 → 采集 API → SQLite → 分析页；桌面/手机筛选与三个视图');
}finally{await browser.close();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));sqlite.close()}
