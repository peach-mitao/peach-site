import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const base=process.argv[2]??'http://127.0.0.1:8790/';
const out=new URL('../evidence/marquee/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch(),report:unknown[]=[];
try{
 for(const width of [320,390,1440])for(const lang of ['zh-CN','en']){
  const page=await browser.newPage({viewport:{width,height:900},locale:lang});
  await page.route('https://api.github.com/**',r=>r.fulfill({json:[]}));
  await page.route('**/releases.json',r=>r.fulfill({json:[]}));
  await page.route('https://img.shields.io/**',r=>r.fulfill({json:{message:'v1.2.3'}}));
  try{
   await page.goto(new URL(lang==='en'?'/en/':'/',base).href,{waitUntil:'networkidle'});
   await page.locator('#features').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>[...document.querySelectorAll('#features .reveal')].every(el=>Number(getComputedStyle(el).opacity)===1));
   await page.mouse.move(0,0);
   const metrics=await page.locator('.marks-row').evaluateAll(rows=>rows.map(row=>{
    const el=row as HTMLElement,style=getComputedStyle(el),children=[...el.children] as HTMLElement[];
    const half=children.length/2;
    return {kind:el.dataset.kind||'film',duration:style.animationDuration,direction:style.animationDirection,
     gap:style.gap,paddingRight:style.paddingRight,height:el.getBoundingClientRect().height,
     singleWidth:el.scrollWidth/2,children:children.length,
     copies:children.slice(half).every((copy,i)=>copy.getAttribute('aria-hidden')==='true'&&copy.innerText===children[i].innerText&&copy.querySelector('img')?.getAttribute('src')===children[i].querySelector('img')?.getAttribute('src')),
     images:children.map(child=>{const img=child.querySelector('img')!,s=getComputedStyle(img),b=img.getBoundingClientRect();return{width:b.width,height:b.height,radius:s.borderRadius}}),
     card:{padding:getComputedStyle(children[0]).padding,radius:getComputedStyle(children[0]).borderRadius}}
   }));
   assert.equal(metrics.length,3,'三条滚动行');
   assert.deepEqual(metrics.map(row=>row.duration),['108s','95s','107s'],'原动画周期');
   assert.deepEqual(metrics.map(row=>row.direction),['normal','reverse','normal'],'原滚动方向');
   for(const row of metrics){
    assert.ok(row.copies,'每行复制一份并对辅助技术隐藏副本');
    assert.ok(row.singleWidth>=1920,'单份内容不短于1920视口');
    assert.equal(row.height,66,'原卡片高度');
    assert.equal(row.gap,'12px');assert.equal(row.paddingRight,'12px');
    assert.equal(row.card.padding,'8px 18px 8px 8px');assert.equal(row.card.radius,'14px');
    assert.ok(row.images.every(image=>Math.abs(image.width-48)<.01&&Math.abs(image.height-48)<.01),'原48px图片尺寸：'+JSON.stringify(row.images));
    assert.ok(row.images.every(image=>image.radius===(row.kind==='performer'?'50%':'10px')),'原图片圆角');
   }
   await page.locator('.marks').hover();
   assert.ok(await page.locator('.marks-row').evaluateAll(rows=>rows.every(row=>getComputedStyle(row).animationPlayState==='paused')),'悬停暂停');
   await page.mouse.move(0,0);
   assert.ok(await page.locator('.marks-row').evaluateAll(rows=>rows.every(row=>getComputedStyle(row).animationPlayState==='running')),'移开继续滚动');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'无页面横向溢出');
   const creditsPath=lang==='en'?'/en/credits/':'/credits/';
   assert.equal(await page.locator('a[href="'+creditsPath+'"]').count(),1,'来源入口仅一处');
   assert.equal(await page.locator('footer a[href="'+creditsPath+'"]').count(),1,'来源入口位于页脚');
   assert.equal(await page.locator('a[href$=".json"]').count(),0,'页面入口使用普通HTML');
   if(lang==='zh-CN'&&(width===390||width===1440))await page.locator('#features').screenshot({path:fileURLToPath(new URL('marquee-'+width+'.png',out))});
   await page.emulateMedia({reducedMotion:'reduce'});
   assert.ok(await page.locator('.marks-row').evaluateAll(rows=>rows.every(row=>getComputedStyle(row).animationName==='none')),'减少动态效果保留静态内容');
   assert.equal(await page.locator('.marks-row > [aria-hidden="true"]:visible').count(),0,'静态内容不显示副本');
   await page.goto(new URL(creditsPath,base).href,{waitUntil:'networkidle'});
   assert.equal(await page.locator('html').getAttribute('lang'),lang);
   assert.ok(await page.locator('.credit-item').count()>0,'来源页面可阅读');
   assert.equal(await page.locator('a[href$=".json"]').count(),0,'来源页面不依赖JSON入口');
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'来源页面无横向溢出');
   if(lang==='zh-CN'&&(width===390||width===1440))await page.screenshot({path:fileURLToPath(new URL('credits-'+width+'.png',out))});
   report.push({width,lang,metrics});console.log('PASS 三条滚动条与来源页',width,lang);
  }finally{await page.close()}
 }
}finally{await browser.close()}
await writeFile(new URL('verification.json',out),JSON.stringify(report,null,2));
