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
  const localVideo=await readFile(new URL('./site/assets/peach-intro-1080p.mp4',import.meta.url));
  const videoPath='/assets/peach-intro-1080p.mp4';
  report.videoRanges=[];
  for(const start of [1048576,0,localVideo.length-1024]) {
    const end=start+1023;
    const range=await request(videoPath,{Range:`bytes=${start}-${end}`});
    assert.equal(range.status,206,'视频必须返回真实范围响应');
    assert.equal(range.headers['content-range'],`bytes ${start}-${end}/${localVideo.length}`);
    assert.equal(range.headers['content-length'],'1024');
    assert.deepEqual(range.body,localVideo.subarray(start,end+1));
    report.videoRanges.push({start,status:range.status,bytes:range.body.length,contentRange:range.headers['content-range']});
  }
  const suffix=await request(videoPath,{Range:'bytes=-1024'});
  assert.equal(suffix.status,206);
  assert.deepEqual(suffix.body,localVideo.subarray(-1024));
  const invalidRange=await request(videoPath,{Range:`bytes=${localVideo.length}-`});
  assert.equal(invalidRange.status,416);
  assert.equal(invalidRange.headers['content-range'],`bytes */${localVideo.length}`);
  report.httpPassed=true;
  if(!httpOnly) {
  browser=await chromium.launch({channel:'chrome'});
  for(const width of [1440,390]) {
    const context=await browser.newContext({viewport:{width,height:width===390?844:900},locale:'zh-CN',hasTouch:width===390});
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
      const timeline=page.locator('[data-media-timeline]');
      await timeline.hover();
      const box=await timeline.boundingBox();
      const duration=await page.locator('[data-media-video]').evaluate(v=>v.duration);
      assert.ok(Math.abs(duration-74.5)<.05,'介绍视频时长为 74.5 秒');
      assert.deepEqual(await page.locator('[data-media-chapter]').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.start))),[0,5,10,15,21,26,32,38.5,43.5,49.5,55,60.5,66,70.5]);
      const y=box.y+box.height/2;
      if(width===390) await page.touchscreen.tap(box.x+box.width*.5,y);
      else await page.mouse.click(box.x+box.width*.5,y);
      await page.waitForFunction(target=>{const v=document.querySelector('[data-media-video]');return !v.seeking&&Math.abs(v.currentTime-target)<.5&&v.readyState>=2},duration*.5,{timeout:30000});
      if(width===1440) {
        for(const fraction of [.75,.2]) {
          await page.mouse.move(box.x+box.width*.5,y);
          await page.mouse.down();
          await page.mouse.move(box.x+box.width*fraction,y,{steps:8});
          await page.mouse.up();
          await page.waitForFunction(target=>{const v=document.querySelector('[data-media-video]');return !v.seeking&&Math.abs(v.currentTime-target)<.5&&v.readyState>=2},duration*fraction,{timeout:30000});
        }
        await page.mouse.move(box.x+box.width*.5,y);
        await page.waitForFunction(target=>{const v=document.querySelector('[data-media-preview-video]');return !v.seeking&&Math.abs(v.currentTime-target)<.5&&v.readyState>=2},duration*.5,{timeout:30000});
        const preview=await page.locator('[data-media-preview-video]').evaluate(v=>{
          const canvas=document.createElement('canvas');canvas.width=32;canvas.height=18;
          const ctx=canvas.getContext('2d');ctx.drawImage(v,0,0,32,18);
          const pixels=ctx.getImageData(0,0,32,18).data;
          let sum=0;for(let i=0;i<pixels.length;i+=4)sum+=pixels[i]+pixels[i+1]+pixels[i+2];
          return {time:v.currentTime,width:v.videoWidth,height:v.videoHeight,mean:sum/(32*18*3)};
        });
        assert.ok(preview.mean>5,'悬停预览必须解码出非黑帧');
        report.preview=preview;
        await page.screenshot({path:fileURLToPath(new URL('player-preview-1440.png',out))});
      }
      report.viewports.push({width,videoSeek:{target:duration*.5,click:true,drag:width===1440}});
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
