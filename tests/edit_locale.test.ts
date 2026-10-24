import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {forRoute,page,post,type LocaleContext} from '../scripts/edit-locale.ts';
import {buildLocale} from '../scripts/build_i18n.ts';
import {historyStatus} from '../scripts/edit-history.ts';

const original=`<!doctype html><html lang="zh-CN"><head></head><body><h1>中文标题</h1><p>说明</p><button role="tab" aria-selected="true" data-k="home" data-say='<b>中文标题</b><span class="sub">说明</span>' data-label="首页">首页</button><script></script></body></html>`;
const initial={pages:{'index.html':'en/index.html'},attributes:{lang:{'zh-CN':'en'}},text:{'中文标题':'English<br>headline','说明':'Details','首页':'Home','<b>中文标题</b><span class="sub">说明</span>':'<b>Title</b><span class="sub">Details</span>'},runtime:{}};
type Metadata={raw:string[];locale:string;history:{revision:string}};
const metadata=(html:string):Metadata=>JSON.parse(/window\.__EDIT=([\s\S]*?)<\/script>/.exec(html)![1]);
async function fixture(run:(root:string,context:LocaleContext)=>Promise<void>){
 const root=await mkdtemp(path.join(tmpdir(),'peach-edit-locale-'));
 try{await mkdir(root+'/site');await mkdir(root+'/i18n');await writeFile(root+'/site/index.html',original);await writeFile(root+'/i18n/en.json',JSON.stringify(initial));await buildLocale('en',{write:true,projectRoot:root});const context=await forRoute(root+'/site','/en/');assert.ok(context);await run(root,context)}
 finally{const absolute=path.resolve(root);assert.ok(absolute.startsWith(path.resolve(tmpdir())+path.sep)&&path.basename(absolute).startsWith('peach-edit-locale-'));await rm(absolute,{recursive:true,force:true})}
}

test('英文入口及其别名使用翻译源，保存文本保留富文本结构和中文源',()=>fixture(async(root,context)=>{
 assert.equal((await forRoute(root+'/site','/en/index.html'))?.source,context.source);
 assert.equal(await forRoute(root+'/site','/en/unknown.html'),null);
 const data=metadata(await page(context,8790));assert.equal(data.locale,'en');const i=data.raw.indexOf('English');assert.ok(i>=0);
 const result=await post(context,'text',{i,raw:data.raw[i],text:'Updated',revision:data.history.revision});assert.equal(result.status,200);
 const locale=JSON.parse(await readFile(context.file,'utf8'));assert.equal(locale.text['中文标题'],'Updated<br>headline');
 assert.equal(await readFile(context.source,'utf8'),original);
 await buildLocale('en',{write:true,projectRoot:root});assert.match(await readFile(root+'/site/en/index.html','utf8'),/<h1>Updated<br>headline<\/h1>/);
}));

test('动态英文覆盖可撤销重做并拒绝过期保存，生成结果保留特殊字符',()=>fixture(async(root,context)=>{
 const data=metadata(await page(context,8790)),text='Price $& <safe> "quoted"';
 const saved=await post(context,'copy',{key:'download.primary.windows',before:'',text,revision:data.history.revision});assert.equal(saved.status,200);
 assert.equal(JSON.parse(await readFile(context.file,'utf8')).overrides['download.primary.windows'],text);
 const generated=await readFile(root+'/site/en/index.html','utf8');assert.match(generated,/Price \$&amp; &lt;safe&gt;/);
 const stale=await post(context,'copy',{key:'download.primary.windows',before:text,text:'Stale',revision:data.history.revision});assert.equal(stale.status,409);
 const undone=await post(context,'undo',{revision:(await historyStatus(context.file)).revision});assert.equal(undone.status,200);assert.equal(JSON.parse(await readFile(context.file,'utf8')).overrides,undefined);
 const redone=await post(context,'redo',{revision:(await historyStatus(context.file)).revision});assert.equal(redone.status,200);assert.equal(JSON.parse(await readFile(context.file,'utf8')).overrides['download.primary.windows'],text);
 assert.equal(await readFile(context.source,'utf8'),original);
}));

test('英文导览标题写回对应译文并在重生成后保留',()=>fixture(async(root,context)=>{
 const result=await post(context,'tab',{k:'home',oldTitle:'Title',oldSub:'Details',title:'New title',sub:'New details',revision:(await historyStatus(context.file)).revision});
 assert.equal(result.status,200);
 assert.equal(JSON.parse(await readFile(context.file,'utf8')).text['<b>中文标题</b><span class="sub">说明</span>'],'<b>New title</b><span class="sub">New details</span>');
 assert.match(await readFile(root+'/site/en/index.html','utf8'),/New title/);
 assert.equal(await readFile(context.source,'utf8'),original);
}));
