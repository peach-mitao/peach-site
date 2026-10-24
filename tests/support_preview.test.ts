import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createPreviewServer} from '../scripts/serve.ts';

test('支持页预览区分文档与资源，文字保存归属当前源文件',async()=>{
 const root=await mkdtemp(path.join(tmpdir(),'peach-support-'));
 const html=(text:string)=>`<html><head></head><body><h1>${text}</h1><script></script></body></html>`;
 await mkdir(path.join(root,'copyright'));
 for(const [file,text] of [['index.html','首页'],['404.html','页面不存在'],['copyright/index.html','版权投诉']])await writeFile(path.join(root,file),html(text));
 const server=await createPreviewServer({root});
 try{
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as import('node:net').AddressInfo).port}`;
  const missing=await fetch(base+'/missing');assert.equal(missing.status,404);assert.match(missing.headers.get('content-type')||'',/text\/html/);assert.equal(await missing.text(),html('页面不存在'));assert.equal(missing.headers.get('cache-control'),'no-store');
  assert.equal(await (await fetch(base+'/missing',{method:'HEAD'})).text(),'');
  const asset=await fetch(base+'/missing.js');assert.equal(asset.status,404);assert.equal(await asset.text(),'Not found');
  for(const [route,raw,text,file] of [['/copyright/','版权投诉','投诉入口','copyright/index.html'],['/missing','页面不存在','没有此页','404.html']]){
   const response=await fetch(base+'/__edit/text',{method:'POST',headers:{origin:base,referer:base+route+'?edit'},body:JSON.stringify({i:0,raw,text})});
   assert.equal(response.status,200,await response.text());assert.equal(await readFile(path.join(root,file),'utf8'),html(text));
  }
  assert.equal(await readFile(path.join(root,'index.html'),'utf8'),html('首页'));
 }finally{await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections()});await rm(root,{recursive:true,force:true})}
});
