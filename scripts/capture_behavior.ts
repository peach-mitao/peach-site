// 参考截图来自维护者本地构建，不读取访客 DOM 或输入。
import {chromium} from 'playwright';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {interactiveSelector,type Box,type Layout} from '../browser/assets/behavior-contract.ts';
import {behaviorStorage} from './behavior_storage.ts';
export interface CaptureManifest {version:1;complete?:boolean;layouts:Layout[];coverage:{route:string;viewport:string;unmapped:unknown[]}[]}
export interface CaptureScene {route:string;click?:string[]}
export async function captureBehavior(base:string,routes:(string|CaptureScene)[],out:string,options:{ready?:()=>boolean}={}){
 const origin=new URL(base);if(!['localhost','127.0.0.1'].includes(origin.hostname))throw Error('参考图只从本地预览生成');
 const browser=await chromium.launch({channel:'chrome'}),result:CaptureManifest={version:1,complete:false,layouts:[],coverage:[]};
 await mkdir(path.resolve(out,'layouts'),{recursive:true});
 try{for(const viewport of [{width:1440,height:1000},{width:390,height:844}]){
  const context=await browser.newContext({viewport,locale:'zh-CN',reducedMotion:'reduce'}),page=await context.newPage();
  const screenshotSession=await context.newCDPSession(page);
  try{for(const scene of routes){
   const route=typeof scene==='string'?scene:scene.route;
   const url=new URL(route,base);if(url.origin!==origin.origin)throw Error('参考路由必须属于当前预览');url.searchParams.set('behavior-capture','1');
   await page.goto(url.href,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.PeachBehavior!==undefined);
   await page.waitForFunction(options.ready||(()=>![...document.querySelectorAll<HTMLElement>('[data-skeleton]')].some(el=>el.checkVisibility()&&el.getBoundingClientRect().height>0)));
   if(typeof scene!=='string')for(const selector of scene.click||[])await page.locator(selector).first().click();
   await page.waitForFunction(()=>{const scope=document.querySelector('dialog[open],[aria-modal="true"],[data-immerse]:not([hidden])')||document;return ![...scope.querySelectorAll<HTMLElement>('[data-skeleton],[aria-busy="true"]')].some(el=>{const box=el.getBoundingClientRect();return el.checkVisibility()&&box.top<16000&&box.bottom>0})});
   await page.evaluate(async()=>{await document.fonts.ready;if(window.PeachBehavior!.context().site==='site'){const height=document.documentElement.scrollHeight;for(let y=0;y<Math.min(height,16000);y+=innerHeight){scrollTo(0,y);await new Promise<void>(resolve=>requestAnimationFrame(()=>resolve()))}}scrollTo(0,0);await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));window.PeachBehavior!.mark()});
   const snapshot=await page.evaluate(selector=>{
    window.PeachBehavior!.mark();
    return {context:window.PeachBehavior!.context(),width:innerWidth,height:document.documentElement.scrollHeight,
     coverage:[...document.querySelectorAll<HTMLElement>(selector)].filter(el=>el.checkVisibility()&&!el.closest('[data-behavior-ignore]')&&!el.dataset.behaviorTarget).map(el=>({tag:el.tagName,id:el.id,label:el.getAttribute('aria-label'),text:el.innerText.slice(0,80),classes:el.className,href:el.getAttribute('href'),icon:el.querySelector('svg use')?.getAttribute('href'),attributes:[...el.attributes].filter(a=>a.name.startsWith('data-')).map(a=>a.name)})),
     boxes:[...document.querySelectorAll<HTMLElement>('[data-behavior-target]')].filter(el=>el.checkVisibility()).flatMap(el=>{const box=el.getBoundingClientRect();return box.width>0&&box.height>0&&box.left>=0&&box.left<innerWidth?[{target:el.dataset.behaviorTarget!,slot:Number(el.dataset.behaviorSlot)||0,x:box.left+scrollX,y:box.top+scrollY,width:box.width,height:box.height}]:[]})};
   },interactiveSelector);
   const capturedHeight=Math.min(snapshot.height,snapshot.context.page==='/immerse'?viewport.height:16000);
   const capture=await screenshotSession.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:true,fromSurface:true,clip:{x:0,y:0,width:snapshot.width,height:capturedHeight,scale:1}});
   const png=Buffer.from(capture.data,'base64'),metadata=await sharp(png).metadata();
   if(metadata.width!==snapshot.width||metadata.height!==capturedHeight)throw Error('参考图实际尺寸与页面坐标不一致：'+route);
   const body=await sharp(png).webp({quality:80}).toBuffer(),hash=createHash('sha256').update(body).digest('hex');
   const image=`layouts/${snapshot.context.version}/${hash}.webp`;await mkdir(path.dirname(path.join(out,image)),{recursive:true});await writeFile(path.join(out,image),body);
   const layout={...snapshot.context,image,width:snapshot.width,height:capturedHeight,boxes:snapshot.boxes.filter(box=>box.y<capturedHeight) as Box[],created:Date.now()} as Layout;
   const key=(row:Layout)=>[row.site,row.version,row.page,row.viewport,row.state,row.lang].join('|');
   if(!result.layouts.some(row=>key(row)===key(layout)))result.layouts.push(layout);
   result.coverage.push({route,viewport:layout.viewport,unmapped:snapshot.coverage});console.log(`${layout.site} ${layout.viewport} ${layout.page} ${layout.state}：${snapshot.coverage.length} 个未映射控件`);
   await writeFile(path.join(out,`behavior-layouts-${layout.site}.json`),JSON.stringify(result,null,2)+'\n');
  }}finally{await context.close()}
 }}finally{await browser.close()}
 const site=result.layouts[0]?.site;if(!site)throw Error('参考布局为空');
 result.complete=true;
 await writeFile(path.join(out,`behavior-layouts-${site}.json`),JSON.stringify(result,null,2)+'\n');return result;
}
export async function registerPreview(manifest:CaptureManifest,out:string){
 const {database,sqlite}=behaviorStorage(path.join(out,'behavior-preview.sqlite'));
 try{for(const row of manifest.layouts)await database.prepare('INSERT OR REPLACE INTO behavior_layouts(site,version,page,viewport,state,lang,image,width,height,boxes,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(row.site,row.version,row.page,row.viewport,row.state,row.lang,row.image,row.width,row.height,JSON.stringify(row.boxes),row.created).run()}finally{sqlite.close()}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [base,routesFile]=process.argv.slice(2);if(!base||!routesFile)throw Error('请提供本地预览地址和路由 JSON 文件');
 const out=fileURLToPath(new URL('../evidence/',import.meta.url)),routes=JSON.parse(await readFile(routesFile,'utf8')) as string[];
 const manifest=await captureBehavior(base,routes,out);await registerPreview(manifest,out);
}
