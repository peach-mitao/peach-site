import assert from 'node:assert/strict';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:8790/';
const publicSite = new URL(base).protocol === 'https:';
const httpOnly = process.argv.includes('--http-only');
const out = new URL(`./evidence/deployment/${publicSite ? 'public' : 'local'}/`, import.meta.url);
await mkdir(out, {recursive:true});
const source = await readFile(new URL('./site/index.html', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const withoutBeacon = bytes => Buffer.from(bytes.toString('utf8').replace(/<script type="module" src="https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js\/[^"\r\n]+"[^>]*><\/script>\r?\n/g,''));
const report = {base, checkedAt:new Date().toISOString(), sourceHash:hash(source), assets:[], viewports:[]};
function request(path, headers={}) {
  const url = new URL(path, base);
  return new Promise((resolve,reject)=>{
    const req=(url.protocol==='https:'?https:http).get(url,{headers,timeout:20000},res=>{
      const chunks=[];
      res.on('data',chunk=>chunks.push(chunk));
      res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,body:Buffer.concat(chunks)}));
      res.on('error',reject);
    });
    req.on('timeout',()=>req.destroy(new Error(`timeout: ${url}`)));
    req.on('error',reject);
  });
}
async function files(dir, prefix='') {
  const result=[];
  for(const entry of await readdir(dir,{withFileTypes:true})) {
    const path=prefix+entry.name;
    if(entry.isDirectory()) result.push(...await files(new URL(`${entry.name}/`,dir),`${path}/`));
    else result.push(path);
  }
  return result;
}
function excluded(path) {
  return path.startsWith('_proto/') || ['index-v1.html','hello-preview.html','.assetsignore','assets/sleeve.jpg'].includes(path)
    || /^assets\/dark\/.*\.jpg$/.test(path)
    || (/^assets\/shots\/.*\.jpg$/.test(path) && path!=='assets/shots/h-dark.jpg')
    || /^assets\/vendor\/sticker-forge\/.*\.d\.ts$/.test(path);
}
let browser;
try {
  const home=await request('/');
  await writeFile(new URL('index.html',out),home.body);
  report.homeHeaders=home.headers;
  report.homeHash=hash(home.body);
  assert.equal(home.status,200);
  report.homeWithoutBeaconHash=hash(withoutBeacon(home.body));
  assert.equal(report.homeWithoutBeaconHash,hash(source),'扣除 CDN 统计脚本后官网定稿逐字节一致');
  if(publicSite) {
    for(const path of (await files(new URL('./site/',import.meta.url))).filter(path=>!excluded(path))) {
      const response=await request(path==='index.html'?'/':path==='copyright/index.html'?'/copyright/':`/${path}`);
      const local=await readFile(new URL(`./site/${path}`,import.meta.url));
      assert.equal(response.status,200,path);
      assert.equal(hash(path.endsWith('.html')?withoutBeacon(response.body):response.body),hash(local),path);
      report.assets.push({path,bytes:local.length,sha256:hash(local)});
    }
    for(const path of ['/index-v1.html','/hello-preview.html','/_proto/stickers/','/assets/dark/detail.jpg','/assets/sleeve.jpg','/__edit.js','/__edit/save']) {
      assert.equal((await request(path)).status,404,path);
    }
    assert.equal((await request('/?edit')).body.includes(Buffer.from('/__edit.js')),false);
  }
  const range=await request('/assets/peach-intro-720p.mp4',{Range:'bytes=0-1023'});
  report.videoRange={status:range.status,bytes:range.body.length,contentRange:range.headers['content-range']??null};
  if(range.status===206) assert.equal(range.body.length,1024);
  else {
    assert.equal(range.status,200);
    assert.equal(hash(range.body),hash(await readFile(new URL('./site/assets/peach-intro-720p.mp4',import.meta.url))));
  }
  report.httpPassed=true;
  if(!httpOnly) {
  browser=await chromium.launch({channel:'chrome'});
  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:width===390?844:900},locale:'zh-CN'});
    try {
      const page=await context.newPage();
      const errors=[],failed=[];
      page.on('pageerror',error=>errors.push(error.message));
      page.on('response',response=>{if(response.status()>=400)failed.push({url:response.url(),status:response.status()})});
      assert.equal((await page.goto(base,{waitUntil:'load',timeout:45000})).status(),200);
      await page.waitForTimeout(8500);
      assert.equal(await page.title(),'Peach · 蜜桃：私人影片馆藏');
      assert.equal(await page.locator('.marks-row').count(),3);
      assert.equal(await page.locator('#screen img[src]').count(),1);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
      await page.screenshot({path:fileURLToPath(new URL(`home-${width}.png`,out))});
      const tabs=[];
      for(const key of ['people','profile','play','follow','stats','home']) {
        await page.locator(`.dock button[data-k="${key}"]`).click();
        const dimensions=await page.locator(`#screen img[data-k="${key}"]`).evaluate(async img=>{await img.decode();return [img.naturalWidth,img.naturalHeight]});
        assert.deepEqual(dimensions,[3840,2160],key); tabs.push({key,dimensions});
      }
      await page.locator('.marks').scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await page.screenshot({path:fileURLToPath(new URL(`rows-${width}.png`,out))});
      await page.locator('.hero [data-media-01-open]').click();
      await page.waitForFunction(()=>document.querySelector('[data-media-video]').readyState>=1,null,{timeout:30000});
      await page.evaluate(()=>document.querySelector('[data-media-video]').pause());
      assert.equal(await page.locator('[data-media-modal]').evaluate(el=>el.hidden),false);
      await page.evaluate(()=>{document.querySelector('[data-media-video]').currentTime=10});
      await page.waitForFunction(()=>{const video=document.querySelector('[data-media-video]');return !video.seeking && video.currentTime>=10 && video.readyState>=2},null,{timeout:30000});
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>document.querySelector('[data-media-modal]').hidden);
      await page.goto(new URL('/copyright/',base).href,{waitUntil:'load'});
      assert.equal(await page.locator('#email').getAttribute('href'),'mailto:dmca@peach.video');
      assert.equal(await page.locator('#prepare').isEnabled(),true);
      assert.deepEqual(errors,[]); assert.deepEqual(failed,[]);
      report.viewports.push({width,title:'Peach · 蜜桃：私人影片馆藏',rows:3,tabs,overflow:false,player:true,copyright:true,errors,failed});
      console.log(`PASS ${width}: 标题、三行资料、六张4K导览、播放器、投诉页`);
    } finally {await context.close()}
  }
  }
  report.passed=!httpOnly;
  report.browserSkipped=httpOnly;
} catch(error) {report.error=error.stack;throw error}
finally {
  await browser?.close();
  await writeFile(new URL('report.json',out),JSON.stringify(report,null,2));
}
