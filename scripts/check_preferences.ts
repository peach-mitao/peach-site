import assert from 'node:assert/strict';
import {once} from 'node:events';
import {chromium} from 'playwright';
import {createPreviewServer} from './serve.ts';
import {behaviorRequest} from '../worker/behavior.ts';
const server=await createPreviewServer({async dynamic(req,res){
 const url=new URL(req.url||'/','http://127.0.0.1');if(url.pathname!=='/privacy/analytics')return false;
 const response=await behaviorRequest(new Request(url),{BEHAVIOR_PREVIEW:'1'});assert.ok(response);res.writeHead(response.status,Object.fromEntries(response.headers)).end(await response.text());return true;
}});
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`,browser=await chromium.launch({channel:'chrome'});
try{
 for(const width of [1440,390])for(const lang of ['zh','en']){
  const context=await browser.newContext({viewport:{width,height:844},locale:lang==='zh'?'en-US':'zh-CN',colorScheme:'dark'}),page=await context.newPage(),errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  const response=await page.goto(`${base}/privacy/analytics?lang=${lang}`,{waitUntil:'networkidle'});assert.equal(response?.headers()['cache-control'],'private, no-store');
  assert.equal(await page.locator('html').getAttribute('lang'),lang==='zh'?'zh-CN':'en');assert.equal(await page.locator('h1').textContent(),lang==='zh'?'统计偏好':'Analytics preferences');
  await page.locator('#analytics-off').click();assert.match(await page.locator('#preference').innerText(),lang==='zh'?/已停用/:/are off/);assert.match(await page.evaluate(()=>document.cookie),/peach_analytics_off=1/);
  await page.reload({waitUntil:'networkidle'});await page.locator('#analytics-on').click();assert.match(await page.locator('#preference').innerText(),lang==='zh'?/已允许/:/are allowed/);assert.doesNotMatch(await page.evaluate(()=>document.cookie),/peach_analytics_off=1/);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  await context.close();console.log(`PASS preferences ${width} ${lang}: 单语言、状态持久化、停用/恢复及生产卡片`);
 }
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
