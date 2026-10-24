// 外语页面复用编辑核心，维护源是翻译表；页面由既有生成器写入。
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {translateHtml,finishTranslation,buildLocale,type Locale,type TranslationBinding} from './build_i18n.ts';
import {bounds,textSlices,injectEditor,editHtml,type EditResult} from './edit-server.ts';
import {serialize,currentHistory,sameRevision,saveWithHistory,travel,EditConflict} from './edit-history.ts';

export interface LocaleContext {site:string;source:string;file:string;code:string}
type Kind='tab'|'text'|'block'|'copy'|'undo'|'redo';
const escape=(value:string)=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const decode=(value:string)=>value.replaceAll('&quot;','"').replaceAll('&#39;',"'").replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');

export async function forRoute(site:string,pathname:string):Promise<LocaleContext|null>{
 if(!pathname.startsWith('/en/'))return null;
 const file=path.resolve(site,'../i18n/en.json');
 let locale:Locale;try{locale=JSON.parse(await readFile(file,'utf8'))}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return null;throw error}
 const target=pathname.endsWith('/')?pathname+'index.html':pathname;
 const source=Object.entries(locale.pages||{}).find(([,generated])=>'/'+generated===target)?.[0];
 if(!source)return null;
 const resolved=path.resolve(site,source),relative=path.relative(site,resolved);
 if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('译文维护源不在当前站点内');
 return {site,source:resolved,file,code:'en'};
}

async function document(context:LocaleContext,locale:Locale){
 const bindings:TranslationBinding[]=[],report={missing:new Set<string>(),used:new Set<string>(),bindings};
 const translated=translateHtml((await readFile(context.source,'utf8')).replaceAll('\r\n','\n'),locale,report);
 const {from,to}=bounds(translated),slices=textSlices(translated,from,to);
 const mapped=new Map<number,TranslationBinding>();
 slices.forEach(([a,b],index)=>{const binding=bindings.find(item=>item.from<=a&&item.to>=b);if(binding)mapped.set(index,binding)});
 return {translated,html:finishTranslation(translated,locale),slices,mapped};
}

export async function page(context:LocaleContext,port:number){
 return serialize(context.file,async()=>{
  const locale:Locale=JSON.parse(await readFile(context.file,'utf8')),doc=await document(context,locale);
  return injectEditor(doc.html,port,await currentHistory(context.file),{locale:context.code,translationKeys:Object.fromEntries([...doc.mapped].map(([index,binding])=>[index,binding.key]))});
 });
}

function attribute(html:string,key:string,name:string){
 const button=[...html.matchAll(/<button\b(?:[^>"']|"[^"]*"|'[^']*')*>/g)].find(([tag])=>tag.includes(`data-k="${key}"`))?.[0];
 const match=button&&new RegExp(`\\b${name}=("([^"]*)"|'([^']*)')`).exec(button);
 if(!match)throw new EditConflict('导览文案来源未取得，请刷新后重试');
 return match[2]??match[3];
}

async function update(context:LocaleContext,locale:Locale,kind:Exclude<Kind,'undo'|'redo'>,body:Record<string,unknown>,doc:Awaited<ReturnType<typeof document>>,edited:EditResult){
 if(kind==='copy'){locale.overrides={...locale.overrides,[body.key as string]:body.text as string};return}
 if(kind==='tab'){
  const source=await readFile(context.source,'utf8'),name=typeof body.title==='string'?'data-say':'data-label';
  locale.text[attribute(source,String(body.k),name)]=decode(attribute(edited.html!,String(body.k),name));return;
 }
 const patches=new Map<string,{from:number;to:number;text:string}[]>();
 const replacements=kind==='text'?[String(edited.json.raw)]: (body.parts as string[]).map(escape);
 for(let offset=0;offset<replacements.length;offset++){
  const index=Number(body.i)+offset,slice=doc.slices[index],binding=doc.mapped.get(index),replacement=replacements[offset];
  if(!slice||!binding){if(!replacement.trim())continue;throw new EditConflict('这段文字没有译文绑定，请刷新后分别编辑文字')}
  const [a,b]=slice,start=Math.max(a,binding.valueFrom),end=Math.min(b,binding.valueTo);
  const lead=doc.translated.slice(a,start),trail=doc.translated.slice(end,b);
  if(!replacement.startsWith(lead)||!replacement.endsWith(trail)||end<start)throw new EditConflict('译文边界已变化，请刷新后重试');
  const text=replacement.slice(lead.length,trail.length?replacement.length-trail.length:undefined);
  const patch={from:start-binding.valueFrom,to:end-binding.valueFrom,text};
  const list=patches.get(binding.key)||[],same=list.find(item=>item.from===patch.from&&item.to===patch.to);
  if(same&&same.text!==text)throw new EditConflict('同一句译文有不同修改，请分别保存');
  if(!same)list.push(patch);patches.set(binding.key,list);
 }
 for(const [key,list]of patches){let value=locale.text[key]??key;for(const patch of list.sort((a,b)=>b.from-a.from))value=value.slice(0,patch.from)+patch.text+value.slice(patch.to);locale.text[key]=value}
}

async function regenerate(context:LocaleContext){
 const report=await buildLocale(context.code,{write:true,projectRoot:path.dirname(context.site)});
 if(report.missing.size||report.runtimeMissing.size||report.stale.length)throw Error('译文生成检查未通过，请核对翻译表');
}

export async function post(context:LocaleContext,kind:Kind,input:unknown):Promise<EditResult>{
 return serialize(context.file,async()=>{
  try{
   if(!input||typeof input!=='object')return {status:400,json:{error:'编辑请求格式无效'}};
   const body=input as Record<string,unknown>,before=await readFile(context.file,'utf8');
   if(!sameRevision(before,body.revision))return {status:409,json:{error:'翻译源已被其他操作修改，请刷新后重试'}};
   if(kind==='undo'||kind==='redo'){const result=await travel(context.file,kind,body.revision);if(result.status===200)await regenerate(context);return result}
   const locale:Locale=JSON.parse(before),doc=await document(context,locale),edited=editHtml(doc.html,kind,input);
   if(edited.status!==200)return edited;
   await update(context,locale,kind,body,doc,edited);
   await saveWithHistory(context.file,before,JSON.stringify(locale,null,2)+'\n');
   try{await regenerate(context)}catch(error){return {status:503,json:{error:'译文已保存，但页面生成失败：'+(error instanceof Error?error.message:String(error))}}}
   return {status:200,json:{...edited.json,history:await currentHistory(context.file)}};
  }catch(error){if(error instanceof EditConflict)return {status:409,json:{error:error.message}};throw error}
 });
}
