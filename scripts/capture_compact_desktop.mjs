import assert from 'node:assert/strict';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const base = process.argv[2] ?? 'https://demo.peach.video/';
const out = new URL('../site/assets/screenshots/', import.meta.url);
await mkdir(out, {recursive:true});
const browser = await chromium.launch({channel:'chrome'});
const report = [];
try {
  const shots=[['home','/?sort=release&jav=1'],['people','/performers'],['profile','/performers/102'],['play','/assets/1'],['follow','/follow?media=images'],['stats','/stats']];
  for(const variant of [{name:'wide',width:1920,height:1080,scale:2,pixels:[3840,2160]},{name:'compact',width:1280,height:960,scale:3,pixels:[3840,2880]}]) {
  for (const [name,route] of shots.filter(([name])=>!process.argv[3]||process.argv[3].split(',').includes(name))) {
    const context = await browser.newContext({viewport:{width:variant.width,height:variant.height},deviceScaleFactor:variant.scale,colorScheme:'dark',locale:'zh-CN',reducedMotion:'reduce'});
    await context.addInitScript(() => {
      // 界面取景使用桌面 2 倍像素密度，导出分辨率由浏览器截图密度控制。
      Object.defineProperty(window,'devicePixelRatio',{get:()=>2});
      localStorage.setItem('peach.settings.v1',JSON.stringify({theme:'dark',homeLayout:'big',detailAutoplay:false}));
    });
    const page = await context.newPage(), errors = [];
    page.on('pageerror',error=>errors.push(error.message));
    try {
      await page.goto(new URL(route,base).href,{waitUntil:'networkidle'});
      await page.addStyleTag({content:'[data-demo-notice]{display:none!important}'});
      await page.waitForTimeout(1500);
      const images=await page.evaluate(async()=>{
        await document.fonts.ready;
        const targets=[...document.images].filter(img=>img.checkVisibility()&&img.getBoundingClientRect().width>0);
        const visible=await new Promise(resolve=>{
          if(!targets.length){resolve([]);return}
          const observer=new IntersectionObserver(entries=>{observer.disconnect();resolve(entries.filter(e=>e.isIntersecting).map(e=>e.target))});
          targets.forEach(img=>observer.observe(img));
        });
        let timeout;
        try{await Promise.race([Promise.all(visible.map(img=>img.decode())),new Promise((_,reject)=>{timeout=setTimeout(()=>reject(Error('可见图片解码超时')),10000)})])}
        finally{clearTimeout(timeout)}
        return visible.map(img=>({src:img.currentSrc,naturalWidth:img.naturalWidth,width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height}));
      });
      await page.evaluate(()=>{document.querySelectorAll('video').forEach(v=>v.pause());document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect?.getComputedTiming().endTime))a.finish()})});
      await page.waitForTimeout(500);
      assert.deepEqual(errors,[],name);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,name);
      const path=fileURLToPath(new URL(`${name}-${variant.name}-20261018.png`,out));
      await page.screenshot({path});
      const png=await readFile(path);
      const pixels=[png.readUInt32BE(16),png.readUInt32BE(20)];
      assert.deepEqual(pixels,variant.pixels,name+' 4K '+variant.name);
      report.push({name,variant:variant.name,route,viewport:[variant.width,variant.height],renderScale:variant.scale,layoutDpr:2,pixels,path,images,errors});
      console.log(name,path);
    } finally {await context.close()}
  }
  }
} finally {await browser.close()}
await mkdir(new URL('../evidence/mobile/',import.meta.url),{recursive:true});
const captureUrl=new URL('../evidence/mobile/capture.json',import.meta.url);
let previous=[];
try{previous=JSON.parse(await readFile(captureUrl,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
const retained=previous.filter(old=>!report.some(shot=>old.name===shot.name&&old.variant===shot.variant));
await writeFile(captureUrl,JSON.stringify([...retained,...report],null,2));
const manifestUrl=new URL('../assets-manifest.json',import.meta.url);
const manifest=JSON.parse(await readFile(manifestUrl,'utf8'));
for(const shot of report) {
  const path=`assets/screenshots/${shot.name}-${shot.variant}-20261018.png`;
  const bytes=await readFile(shot.path);
  const entry={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const index=manifest.files.findIndex(file=>file.path===path);
  if(index>=0)manifest.files[index]=entry;else manifest.files.push(entry);
}
await writeFile(manifestUrl,JSON.stringify(manifest,null,2)+'\n');
