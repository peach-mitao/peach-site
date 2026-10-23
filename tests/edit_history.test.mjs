import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtemp,readFile,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {post,page} from '../scripts/edit-server.ts';
import {historyStatus,historyFile} from '../scripts/edit-history.ts';

async function fixture(run){
  const root=await mkdtemp(path.join(tmpdir(),'peach-edit-history-')),file=path.join(root,'index.html');
  try{await run(file)}finally{await rm(root,{recursive:true,force:true})}
}
const original='<html><body><p>Mac 说明<button>查看打开步骤</button></p><script></script></body></html>';
test('整段文字删除可撤销和重做，源码标签与按钮完整恢复',()=>fixture(async file=>{
  await writeFile(file,original);
  const saved=await post(file,'text',{i:0,raw:'Mac 说明',text:''});assert.equal(saved.status,200);
  assert.equal(saved.json.history.undoCount,1);
  const deleted=await readFile(file,'utf8');assert.match(deleted,/<p><button>查看打开步骤/);
  const undone=await post(file,'undo',{revision:saved.json.history.revision});assert.equal(undone.status,200);
  assert.equal(await readFile(file,'utf8'),original);
  const redone=await post(file,'redo',{revision:undone.json.history.revision});assert.equal(redone.status,200);
  assert.equal(await readFile(file,'utf8'),deleted);
  assert.equal((await historyStatus(file)).undoCount,1);
  assert.match(await page(file,8795),/"undoCount":1/);
}));
test('多次保存按顺序撤销，撤销后新保存清空重做分支',()=>fixture(async file=>{
  await writeFile(file,original);
  await post(file,'copy',{key:'download.caption',before:'',text:'动态文案'});
  const saved=await post(file,'text',{i:0,raw:'Mac 说明',text:'新的说明'});
  assert.equal(saved.json.history.undoCount,2);
  const undo=await post(file,'undo',{revision:saved.json.history.revision});
  const next=await post(file,'text',{i:0,raw:'Mac 说明',text:'另一条说明',revision:undo.json.history.revision});
  assert.equal(next.status,200);assert.equal(next.json.history.redoCount,0);
  assert.equal((await post(file,'redo',{revision:next.json.history.revision})).status,409);
}));
test('过期撤销和并发保存拒绝覆盖其他改动',()=>fixture(async file=>{
  await writeFile(file,original);const before=await historyStatus(file);
  const edits=await Promise.all(['甲','乙'].map(text=>post(file,'text',{i:0,raw:'Mac 说明',text,revision:before.revision})));
  assert.deepEqual(edits.map(x=>x.status).sort(),[200,409]);
  const saved=edits.find(x=>x.status===200);await writeFile(file,original+'<!-- 外部修改 -->');
  assert.equal((await post(file,'undo',{revision:saved.json.history.revision})).status,409);
  assert.equal(await readFile(file,'utf8'),original+'<!-- 外部修改 -->');
  assert.equal((await historyStatus(file)).undoCount,0);
}));
test('源文件写入失败保留源文与撤销位置',()=>fixture(async file=>{
  await writeFile(file,original);const saved=await post(file,'text',{i:0,raw:'Mac 说明',text:'新文'});
  const source=await readFile(file,'utf8');await mkdir(file+'.tmp');
  await assert.rejects(post(file,'undo',{revision:saved.json.history.revision}));
  assert.equal(await readFile(file,'utf8'),source);assert.equal((await historyStatus(file)).undoCount,1);
}));
test('已写入源文的中断事务可恢复撤销记录',()=>fixture(async file=>{
  await writeFile(file,original);const after=original.replace('Mac 说明','新文');
  await writeFile(historyFile(file),JSON.stringify({version:1,states:[original],cursor:0,pending:{before:original,after,next:{version:1,states:[original,after],cursor:1}}}));
  await writeFile(file,after);const current=await historyStatus(file);assert.equal(current.undoCount,1);
  assert.equal((await post(file,'undo',{revision:current.revision})).status,200);assert.equal(await readFile(file,'utf8'),original);
}));
