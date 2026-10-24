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
export function renderCredits(sources:Record<string,unknown>){
 const groups=Object.entries(sources).filter(([,items])=>Array.isArray(items));
 const labels:Record<string,string>={films:'电影图片',people:'人物照片',organizations:'机构与标志',assets:'其他展示素材'};
 const content=groups.map(([key,items])=>{
  const entries=(items as CreditItem[]).map(item=>{
   const title=item.title||item.name||'',source=item.source||item.url;
   if(!title||!source)throw Error('素材来源缺少名称或原始页面');
   const attribution=item.attribution||item.author;
   return '<section class="credit-item"><h3 translate="no">'+escape(title)+(item.original_name&&item.original_name!==title?' / '+escape(item.original_name):'')+(item.year?' · '+escape(item.year):'')+'</h3>'
    +(attribution?'<p translate="no">'+escape(attribution)+'</p>':'')
    +'<p>'+link(source,'原始页面')
    +(item.license_url?' · '+link(item.license_url,'<span translate="no">'+escape(item.license||'License')+'</span>'):item.license?' · <span translate="no">'+escape(item.license)+'</span>':'')
    +(item.license_source?' · '+link(item.license_source,'许可说明'):'')+'</p>'
    +(item.changes?'<p class="subtle">'+escape(item.changes)+'</p>':'')+'</section>';
  }).join('\n');
  return '<section><h2>'+escape(labels[key]||'展示素材')+'</h2>\n'+entries+'</section>';
 }).join('\n');
 return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script src="/assets/locale.js"></script>
<title>素材来源与许可 · Peach</title>
<meta name="description" content="Peach 官网与演示站展示素材的来源、署名与许可。">
<link rel="alternate" hreflang="zh-CN" href="https://peach.video/credits/">
<link rel="alternate" hreflang="en" href="https://peach.video/en/credits/">
<meta name="color-scheme" content="light dark">
<script src="/assets/page-support.js"></script>
<link rel="stylesheet" href="/assets/support-ui/inter/index.css">
<link rel="stylesheet" href="/assets/support-ui/peach-pages.css">
<link rel="stylesheet" href="/assets/support.css">
<style>.credit-item{margin-top:24px;padding-top:20px;border-top:1px solid var(--color-separator-border,#8884)}.credit-item h3{font-size:16px;font-weight:600}.credit-item p{margin:8px 0;overflow-wrap:anywhere}.credit-item a{display:inline-block;min-height:32px}</style>
</head>
<body class="peach-react"><main class="flex justify-center px-6 py-12 max-sm:px-4 max-sm:py-6">
<article class="support-document flex w-full flex-col gap-6 rounded-3xl border border-separator-border bg-background-secondary-default p-8 max-sm:p-5" aria-labelledby="credits-title">
<p class="support-top"><a href="/">← Peach 官网</a><a href="/en/credits/" lang="en">English</a></p>
<header class="flex flex-col gap-1"><img src="/assets/support-ui/logo.png" alt="" width="40" height="40" decoding="async" class="mb-4 size-10"><h1 id="credits-title">素材来源与许可</h1></header>
<p>本页列出官网与演示站展示素材的来源、署名与许可。主导览展示应用真实界面；电影图片在功能示意、封面与贴纸中可能按容器裁切。</p>
<p>功能示意使用预置资料，来源支持以应用当前配置为准。演示站播放操作仅提示「仅提供演示」。</p>
${content}
<p class="subtle">Peach 源码的许可不改变展示素材及第三方内容的权利。版权问题请使用<a href="/copyright/">版权投诉</a>入口。</p>
</article></main></body></html>
`;
}
export async function buildCredits({check=false}={}){
 const sources=JSON.parse(await readFile(path.join(root,'docs/film-sources.json'),'utf8'));
 const target=path.join(root,'site/credits/index.html'),html=renderCredits(sources);
 if(check){
  const current=await readFile(target,'utf8').catch(()=>null);
  if(current?.replaceAll('\r\n','\n')!==html)throw Error('请运行 npm run credits:build 更新素材来源页面');
 }else{await mkdir(path.dirname(target),{recursive:true});await writeFile(target,html)}
 return html;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildCredits({check:process.argv.includes('--check')});
