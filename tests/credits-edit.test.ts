import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {context} from '../scripts/edit-credits.ts';
import {buildCredits} from '../scripts/build_credits.ts';
import {post,bounds,textSlices} from '../scripts/edit-server.ts';
import {currentHistory} from '../scripts/edit-history.ts';
test('素材页面说明写回模板，重建与撤销保留来源资料',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'peach-credits-'));
 try{
  await mkdir(path.join(root,'docs'));await mkdir(path.join(root,'templates'));
  const template='<html><body><h1>素材来源</h1><!--credits--><p>来源说明</p></body></html>\n';
  await writeFile(path.join(root,'templates/credits.html'),template);
  await writeFile(path.join(root,'docs/film-sources.json'),JSON.stringify({films:[{title:'Test film',source:'https://example.test',license:'CC0'}]}));
  const site=path.join(root,'site');await buildCredits({projectRoot:root});
  const edit=(await context(site,'/credits/'))!;
  const html=await readFile(path.join(site,'credits/index.html'),'utf8'),{from,to}=bounds(html),slices=textSlices(html,from,to),i=slices.findIndex(([a,b])=>html.slice(a,b)==='来源说明');
  const result=await post(edit.file,'text',{i,raw:'来源说明',text:'维护后的说明',revision:(await currentHistory(edit.file)).revision},edit.view);
  assert.equal(result.status,200);await buildCredits({projectRoot:root});
  assert.match(await readFile(edit.file,'utf8'),/维护后的说明/);
  const rendered=await readFile(path.join(site,'credits/index.html'),'utf8');assert.match(rendered,/维护后的说明/);assert.match(rendered,/Test film/);
  const section=bounds(rendered),parts=textSlices(rendered,section.from,section.to),title=parts.findIndex(([a,b])=>rendered.slice(a,b)==='Test film');
  assert.equal((await post(edit.file,'text',{i:title,raw:'Test film',text:'不可覆盖',revision:(await currentHistory(edit.file)).revision},edit.view)).status,409);
  assert.equal((await post(edit.file,'undo',{revision:(await currentHistory(edit.file)).revision},edit.view)).status,200);
  assert.equal(await readFile(edit.file,'utf8'),template);assert.match(await readFile(path.join(site,'credits/index.html'),'utf8'),/来源说明/);
 }finally{await rm(root,{recursive:true,force:true})}
});
