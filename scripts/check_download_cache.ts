import assert from 'node:assert/strict';
import {once} from 'node:events';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {createPreviewServer} from './serve.ts';
let version='1.2.3',available=true;const requests:string[]=[];
const release=(value:string)=>({tag_name:'v'+value,published_at:`2026-01-${value.split('.').at(-1)!.padStart(2,'0')}T00:00:00Z`,assets:[`Peach-${value}-windows-x64-setup.exe`,`Peach-${value}-windows-x64.zip`].map(name=>({name,state:'uploaded',size:123,digest:'sha256:'+'a'.repeat(64)}))});
const html=(await readFile(new URL('../site/index.html',import.meta.url),'utf8')).replace('<head>','<head><meta name="peach-public-downloads" content="/cache-index.json">');
const server=await createPreviewServer({async dynamic(req,res){
 const url=new URL(req.url||'/','http://localhost');
 if(url.pathname==='/cache-prime'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'}).end('<script>fetch("/cache-index.json").then(r=>r.json()).then(x=>window.primed=x[0].tag_name)</script>');return true}
 if(url.pathname==='/cache-index.json'){requests.push(req.headers['cache-control']||'');await new Promise(resolve=>setTimeout(resolve,100));res.writeHead(available?200:503,{'content-type':'application/json','cache-control':'public,max-age=14400'}).end(JSON.stringify(available?[release(version)]:[]));return true}
 if(url.pathname==='/'){res.writeHead(200,{'content-type':'text/html','cache-control':'no-store'}).end(html);return true}
 return false;
}});
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
const browser=await chromium.launch({channel:'chrome'});
try{
 const context=await browser.newContext({locale:'zh-CN'}),page=await context.newPage();
 // 不使用 route()，保留真实浏览器 HTTP 缓存；只替代两个外部版本源。
 await context.addInitScript(()=>{
  const native=window.fetch.bind(window);
  window.fetch=(input,options)=>{
   const url=typeof input==='string'?input:input instanceof Request?input.url:input.toString();
   if(url.startsWith('https://api.github.com/repos/peach-mitao/peach/releases')){
    const v=(window as Window&{testGitHubVersion?:string}).testGitHubVersion;
    return Promise.resolve(Response.json(v?[{tag_name:'v'+v,published_at:`2026-01-${v.split('.').at(-1)!.padStart(2,'0')}T00:00:00Z`,assets:[`Peach-${v}-windows-x64-setup.exe`,`Peach-${v}-windows-x64.zip`].map(name=>({name,state:'uploaded',size:123,digest:'sha256:'+'a'.repeat(64)}))}]:[]));
   }
   if(url.startsWith('https://img.shields.io/'))return Promise.resolve(Response.json({message:'v1.2.3'}));
   return native(input,options);
  };
 });
 await page.goto(base+'/cache-prime');await page.waitForFunction(()=>(window as Window&{primed?:string}).primed==='v1.2.3');assert.equal(requests.length,1);
 version='1.2.4';await page.goto(base+'/?lang=zh&platform=windows',{waitUntil:'networkidle'});
 const href=()=>page.locator('[data-download="setup"]').getAttribute('href');
 assert.equal(await href(),'https://downloads.peach.video/v1.2.4/Peach-1.2.4-windows-x64-setup.exe');assert.ok(requests.length>=2);assert.match(requests.at(-1)!,/no-cache|max-age=0/);
 const before=requests.length;version='1.2.5';await page.evaluate(()=>{dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))});
 await page.waitForFunction(()=>document.querySelector<HTMLAnchorElement>('[data-download="setup"]')?.href.includes('1.2.5'));assert.equal(requests.length,before+1);
 available=false;await page.evaluate(()=>{(window as Window&{testGitHubVersion?:string}).testGitHubVersion='1.2.6';dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}))});
 await page.waitForFunction(()=>document.querySelector<HTMLAnchorElement>('[data-download="setup"]')?.href.includes('github.com')===true);
 version='1.2.6';available=true;await page.evaluate(()=>dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true})));
 await page.waitForFunction(()=>document.querySelector<HTMLElement>('[data-backup-slot="setup"]')?.hidden===false);
 assert.equal(await href(),'https://github.com/peach-mitao/peach/releases/download/v1.2.6/Peach-1.2.6-windows-x64-setup.exe');
 assert.equal(await page.locator('[data-backup-download="setup"]').getAttribute('href'),'https://downloads.peach.video/v1.2.6/Peach-1.2.6-windows-x64-setup.exe');
 assert.match(await page.locator('[data-release-version="windows"]').innerText(),/1\.2\.6/);await context.close();
 console.log('PASS: 四小时旧HTTP缓存、返回页面刷新、并发合并、GitHub 主入口与同版本 R2 备用入口恢复');
}finally{await browser.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))}
