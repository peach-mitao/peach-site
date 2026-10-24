import type {IncomingHttpHeaders} from 'node:http';
import assert from 'node:assert/strict';
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
interface HTTPResult{status:number|undefined;headers:IncomingHttpHeaders;body:Buffer}
const base=process.argv[2]??'http://127.0.0.1:8790/',publicSite=new URL(base).protocol==='https:',httpOnly=process.argv.includes('--http-only');
const out=new URL('../evidence/deployment/'+(publicSite?'public':'local')+'/',import.meta.url);
await mkdir(out,{recursive:true});
const source=await readFile(new URL('../site/index.html',import.meta.url));
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const withoutBeacon=(bytes:Buffer)=>Buffer.from(bytes.toString('utf8').replace(/<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\/[^"\r\n]+"[^>]*><\/script>\r?\n/g,''));
const report:Record<string,any>={base,checkedAt:new Date().toISOString(),sourceHash:hash(source),assets:[],viewports:[]};
const currentScreenshot=/^assets\/screenshots\/(?:(?:home|people|profile|play|follow)-(?:wide|compact)-20261025-2|stats-(?:wide|compact)-20261025-3)(?:-\d+)?\.(?:png|webp)$/;
function request(path:string):Promise<HTTPResult>{
 const url=new URL(path,base);
 return new Promise((resolve,reject)=>{
  const req=(url.protocol==='https:'?https:http).get(url,{timeout:20000},res=>{
   const chunks:Buffer[]=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));res.on('error',reject);
  });req.on('timeout',()=>req.destroy(new Error('timeout: '+url)));req.on('error',reject);
 });
}
async function files(dir:URL,prefix=''):Promise<string[]>{
 const result:string[]=[];
 for(const entry of await readdir(dir,{withFileTypes:true})){
  const path=prefix+entry.name;
  if(entry.isDirectory())result.push(...await files(new URL(entry.name+'/',dir),path+'/'));else result.push(path);
 }return result;
}
function excluded(path:string){
 return /^(?:_proto|assets\/(?:dark|shots|entities|marks|mock|stickers))\//.test(path)
 ||path.startsWith('assets/screenshots/')&&!currentScreenshot.test(path)
 ||['index-v1.html','hello-preview.html','.assetsignore','_redirects','_headers','404.html','unavailable.html','assets/sleeve.jpg','assets/intro-poster.jpg','assets/peach-intro-1080p.mp4'].includes(path)
 ||/^assets\/vendor\/sticker-forge\/.*\.d\.ts$/.test(path);
}
let browser;
try{
 const home=await request('/');assert.equal(home.status,200);
 const homeSource=publicSite?withoutBeacon(home.body):Buffer.from(home.body.toString('utf8').replace('\n<meta name="peach-public-downloads" content="/__preview/releases.json">',''));
 assert.equal(hash(homeSource),hash(source),'首页与中文源一致');
 await writeFile(new URL('index.html',out),home.body);report.homeHeaders=home.headers;
 if(publicSite){
  for(const path of (await files(new URL('../site/',import.meta.url))).filter(path=>!excluded(path))){
   const response=await request(path.endsWith('index.html')?'/'+path.slice(0,-10):'/'+path),local=await readFile(new URL('../site/'+path,import.meta.url));
   assert.equal(response.status,200,path);assert.equal(hash(path.endsWith('.html')?withoutBeacon(response.body):response.body),hash(local),path);
   report.assets.push({path,bytes:local.length,sha256:hash(local)});
  }
  for(const path of ['/assets/peach-intro-1080p.mp4','/assets/intro-poster.jpg','/assets/screenshots/home-wide-20261018.webp','/assets/entities/performer-remu.webp','/__edit.js','/__edit/save']){
   assert.equal((await request(path)).status,404,path);
  }
  assert.equal((await request('/__missing__/')).status,404);
  assert.equal((await request('/api/event')).status,405);
  assert.equal(home.body.includes(Buffer.from('/__edit.js')),false);
 }
 const manifest=JSON.parse(await readFile(new URL('../assets-manifest.json',import.meta.url),'utf8'));
 for(const file of manifest.files.filter((item:{path:string})=>/^assets\/(?:films|people)\//.test(item.path)||currentScreenshot.test(item.path))){
  const response=await request('/'+file.path);assert.equal(response.status,200,file.path);
  assert.equal(response.body.length,file.bytes,file.path);assert.equal(hash(response.body),file.sha256,file.path);
  report.assets.push({path:file.path,bytes:file.bytes,sha256:file.sha256});
 }
 report.httpPassed=true;
 if(!httpOnly){
  browser=await chromium.launch();
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:width===390?844:900},locale:'zh-CN'}),errors:string[]=[];
   page.on('pageerror',error=>errors.push(error.message));
   await page.route('https://api.github.com/**',r=>r.fulfill({json:[]}));
   await page.route('https://downloads.peach.video/releases.json',r=>r.fulfill({json:[]}));
   await page.route('https://img.shields.io/**',r=>r.fulfill({json:{message:'v1.2.3'}}));
   try{
    await page.goto(base,{waitUntil:'networkidle'});
    assert.equal(await page.title(),'Peach · 蜜桃：私人影片馆藏');
    assert.equal(await page.locator('.live[data-mock]').count(),5);
    assert.equal(await page.locator('[data-media-video]').count(),0);
    for(const key of ['home','people','profile','play','follow','stats']){
     await page.locator('.dock button[data-k="'+key+'"]').click();
     await page.waitForFunction(key=>(document.querySelector('#screen picture.on') as HTMLElement)?.dataset.k===key,key);
     await page.locator('#screen picture.on img').evaluate(img=>(img as HTMLImageElement).decode());
    }
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    assert.equal(await page.locator('.marks-row').count(),3);
    assert.equal(await page.locator('footer a[href="/credits/"]').count(),1);
    await page.screenshot({path:fileURLToPath(new URL('home-'+width+'.png',out))});
    await page.goto(new URL('/copyright/',base).href,{waitUntil:'load'});
    assert.equal(await page.locator('#email').getAttribute('href'),'mailto:dmca@peach.video');
    assert.equal(await page.locator('#prepare').isEnabled(),true);
    assert.deepEqual(errors,[]);report.viewports.push({width,screenTabs:6,marqueeRows:3,functionCards:5,copyright:true,errors});
    console.log('PASS',width,'界面导览、滚动条、功能卡、版权页');
   }finally{await page.close()}
  }
 }
 report.passed=true;report.browserSkipped=httpOnly;
}catch(error){report.error=error instanceof Error?error.stack:String(error);throw error}
finally{await browser?.close();await writeFile(new URL('report.json',out),JSON.stringify(report,null,2))}
