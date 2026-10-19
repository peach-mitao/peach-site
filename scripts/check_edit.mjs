import assert from 'node:assert/strict';
import {cp, mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import sharp from 'sharp';
import {createPreviewServer} from './serve.ts';

// 写操作只落到临时站点，验证真实编辑、平台切换、重绘与刷新后的持久化。
const root=await mkdtemp(path.join(tmpdir(),'peach-edit-browser-'));
await cp(fileURLToPath(new URL('../site/',import.meta.url)),root,{recursive:true,
  filter:source=>!(/\.(png|webp|jpg|mp4|woff2|zip|dmg)$/i.test(source))});
const server=await createPreviewServer({root});
let browser;
try {
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}/?edit&platform=windows`;
  browser=await chromium.launch({channel:process.env.CI?undefined:'chrome'});
  for(const width of [1440,390]){
    await cp(fileURLToPath(new URL('../site/index.html',import.meta.url)),path.join(root,'index.html'));
    const page=await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    await page.route('https://api.github.com/**',route=>route.fulfill({json:[]}));
    const pixel=await sharp({create:{width:1,height:1,channels:4,background:'#18191a'}}).webp().toBuffer();
    await page.route('**/assets/screenshots/**',route=>route.fulfill({contentType:'image/webp',body:pixel}));
    await page.goto(base,{waitUntil:'networkidle'});
    async function edit(locator,text){
      await locator.evaluate(element=>element.scrollIntoView({block:'center'}));
      await locator.click({trial:true});
      const point=await locator.evaluate(element=>{
        const walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
        for(let node=walker.nextNode();node;node=walker.nextNode()){
          if(!node.data.trim()||node.parentElement.closest('svg'))continue;
          const range=document.createRange();range.selectNodeContents(node);const rect=range.getClientRects()[0];
          return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
        }
        throw Error('编辑目标没有可见文字');
      });
      await page.mouse.click(point.x,point.y);
      const box=page.locator('.__ee,.__ei');
      try {await box.waitFor({timeout:5000})} catch(error){
        console.error(await page.evaluate(point=>({point,hit:document.elementFromPoint(point.x,point.y)?.outerHTML,
          status:document.querySelector('.__eb')?.innerText,caret:document.caretRangeFromPoint(point.x,point.y)?.startContainer?.textContent}),point));
        throw error;
      }
      await box.fill(text);await box.press('Enter');
      await page.waitForFunction(()=>/已保存|已删除/.test(document.querySelector('.__eb .st')?.textContent||''));
    }
    const mac=page.locator('[data-platform-option="macos"]');
    const docker=page.locator('[data-platform-option="docker"]');
    await mac.click();await page.locator('[data-download-panel="macos"]').waitFor({state:'visible'});
    await edit(page.locator('[data-macos-status]'),`Mac 文案 ${width}`);
    await docker.click();await page.locator('[data-download-panel="docker"]').waitFor({state:'visible'});
    await edit(page.locator('[data-platform-hint]'),`Docker 提示 ${width}`);
    await edit(page.locator('[data-download-panel="docker"] h3'),`Docker 部署 ${width}`);
    await mac.click();assert.equal(await page.locator('[data-macos-status]').innerText(),`Mac 文案 ${width}`);
    await edit(page.locator('[data-macos-status]'),'');
    assert.equal(await page.locator('[data-macos-status]').innerText(),'');
    await docker.click();
    const paragraph=page.locator('[data-download-panel="docker"] > p').first();
    await edit(paragraph,'');assert.equal(await paragraph.innerText(),'');
    await edit(page.locator('[data-download-panel="docker"] > p').last(),`删除后继续编辑 ${width}`);
    await page.reload({waitUntil:'networkidle'});await docker.click();
    assert.equal(await paragraph.innerText(),'');
    assert.equal(await page.locator('[data-download-panel="docker"] > p').last().innerText(),`删除后继续编辑 ${width}`);
    await docker.click();assert.equal(await page.locator('[data-platform-hint]').innerText(),`Docker 提示 ${width}`);
    await page.reload({waitUntil:'networkidle'});
    await docker.click();assert.equal(await page.locator('[data-platform-hint]').innerText(),`Docker 提示 ${width}`);
    assert.match(await page.locator('[data-download-panel="docker"] h3').innerText(),new RegExp(`Docker 部署 ${width}`));
    await mac.click();assert.equal(await page.locator('[data-macos-status]').innerText(),'');
    // 其他切换区也照常工作，切换后生成的导览标题仍能保存。
    await page.locator('.dock [data-k="people"]').click();
    await page.waitForFunction(()=>document.querySelector('.dock [data-k="people"]')?.getAttribute('aria-selected')==='true');
    await edit(page.locator('#stage-say b'),`导览标题 ${width}`);
    await page.locator('.dock [data-k="home"]').click();
    await page.locator('.dock [data-k="people"]').click();
    assert.equal(await page.locator('#stage-say b').innerText(),`导览标题 ${width}`);
    await page.locator('.dock [data-k="home"]').click();
    await page.waitForFunction(()=>document.querySelector('.dock [data-k="home"]')?.getAttribute('aria-selected')==='true');
    if(await page.locator('#stage-say .sub').count())await edit(page.locator('#stage-say .sub'),'');
    await docker.click();
    await edit(page.locator('[data-download-panel="docker"] > p').last(),`删除默认导览说明后继续 ${width}`);
    await page.reload({waitUntil:'networkidle'});await docker.click();
    assert.equal(await page.locator('[data-download-panel="docker"] > p').last().innerText(),`删除默认导览说明后继续 ${width}`);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const html=await readFile(path.join(root,'index.html'),'utf8');
    assert.match(html,/data-copy-overrides=/);assert.match(html,new RegExp(`Docker 提示 ${width}`));
    console.log(`PASS ${width}: 编辑模式平台切换、静态与动态文案、刷新持久化、导览切换与窄屏`);
    await page.close();
  }
} finally {
  await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
  await rm(root,{recursive:true,force:true});
}
