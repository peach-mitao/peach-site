import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
interface CreditItem{
 title?:string;name?:string;year?:number;source?:string;url?:string;
 attribution?:string;author?:string;license?:string;license_url?:string;license_source?:string;changes?:string;original_name?:string;
}
const root=fileURLToPath(new URL('../',import.meta.url));
const escape=(value:unknown)=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function link(url:string,label:string){
 const target=new URL(url);if(!['https:','http:'].includes(target.protocol))throw Error('素材来源必须使用 HTTP 或 HTTPS');
 return '<a href="'+escape(target.href)+'">'+label+'</a>';
}
export function renderCredits(sources:Record<string,unknown>,template:string){
 const groups=Object.entries(sources).filter(([,items])=>Array.isArray(items));
 const labels:Record<string,string>={films:'电影图片',people:'人物照片',organizations:'机构与标志',assets:'其他展示素材'};
 const content=groups.map(([key,items])=>{
  const entries=(items as CreditItem[]).map(item=>{
   const title=item.title||item.name||'',source=item.source||item.url;
   if(!title||!source)throw Error('素材来源缺少名称或原始页面');
   const attribution=item.attribution||item.author;
   return '<section class="credit-item"><h3 translate="no">'+escape(title)+(item.original_name&&item.original_name!==title?' / '+escape(item.original_name):'')+(item.year?' · '+escape(item.year):'')+'</h3>'
    +(attribution?'<p translate="no">'+escape(attribution)+'</p>':'')
    +'<p class="credit-links">'+link(source,'原始页面')
    +(item.license_url?link(item.license_url,'<span translate="no">'+escape(item.license||'License')+'</span>'):item.license?'<span translate="no">'+escape(item.license)+'</span>':'')
    +(item.license_source?link(item.license_source,'许可说明'):'')+'</p>'
    +(item.changes?'<p class="subtle">'+escape(item.changes)+'</p>':'')+'</section>';
  }).join('\n');
  return '<section class="credit-group"><h2>'+escape(labels[key]||'展示素材')+'</h2>\n'+entries+'</section>';
 }).join('\n');
 if(template.split('<!--credits-->').length!==2)throw Error('素材来源模板需要唯一的内容占位');
 return template.replace('<!--credits-->',()=>`<!--credits:start-->${content}<!--credits:end-->`);
}
export async function buildCredits({check=false,projectRoot=root}={}){
 const sources=JSON.parse(await readFile(path.join(projectRoot,'docs/film-sources.json'),'utf8'));
 const template=(await readFile(path.join(projectRoot,'templates/credits.html'),'utf8')).replaceAll('\r\n','\n');
 const target=path.join(projectRoot,'site/credits/index.html'),html=renderCredits(sources,template);
 if(check){
  const current=await readFile(target,'utf8').catch(()=>null);
  if(current?.replaceAll('\r\n','\n')!==html)throw Error('请运行 npm run credits:build 更新素材来源页面');
 }else{await mkdir(path.dirname(target),{recursive:true});await writeFile(target,html)}
 return html;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildCredits({check:process.argv.includes('--check')});
