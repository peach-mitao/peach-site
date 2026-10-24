// 仅输出待确认的视觉预览，不包含回归断言或表单提交。
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
const directory=process.argv[2],recipe=process.argv[3];if(!directory||!recipe)throw Error('请指定截图输出目录与页面清单 JSON');
const {readFile}=await import('node:fs/promises');
const views=JSON.parse(await readFile(recipe,'utf8')) as {name:string;url:string;width:number;scheme:'dark'|'light';locale?:string}[];
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({channel:'chrome'}),report=[];
try{
 for(const view of views){
  if(!/^[a-z0-9-]+$/.test(view.name)||!Number.isSafeInteger(view.width)||view.width<=0)throw Error('页面清单中的名称或视口无效');
  const context=await browser.newContext({viewport:{width:view.width,height:view.width===390?844:900},colorScheme:view.scheme,locale:view.locale||'zh-CN'}),page=await context.newPage();
  const response=await page.goto(view.url,{waitUntil:'networkidle',timeout:30000});
  await page.screenshot({path:path.join(directory,view.name+'.png'),fullPage:true});
  report.push({name:view.name,status:response?.status(),...await page.evaluate(()=>({title:document.title,language:document.documentElement.lang,theme:document.documentElement.className,heading:document.querySelector('h1')?.textContent,edit:!!document.querySelector('[data-copy-toolbar-host],.__eb'),bodyWidth:document.body.scrollWidth,viewport:innerWidth}))});
  await context.close();
 }
}finally{await browser.close()}
await writeFile(path.join(directory,'visual-preview.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
