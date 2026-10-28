import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {deliver,checkAssets,type DeliveryReceipt,type DeliveryActions} from '../scripts/deliver.ts';

function fixture(){
 const calls:string[]=[],records:DeliveryReceipt[]=[];
 const actions:DeliveryActions={async prepare(){return {reference_count:20}},async freeze(){return 'frozen'},
  async publish(){calls.push('upload')},async deploy(){calls.push('deploy')},async verify(){calls.push('verify')}};
 const persist=async(receipt:DeliveryReceipt)=>{records.push(structuredClone(receipt))};
 return {calls,records,actions,persist};
}
test('预演只准备计划，不上传或部署，回执与完成状态区分',async()=>{
 const f=fixture();const receipt=await deliver(false,f.actions,f.persist);
 assert.equal(receipt.state,'planned');assert.deepEqual(f.calls,[]);assert.equal(receipt.plan?.input_sha256,'frozen');
 assert.equal(f.records[0]!.state,'running');assert.equal(f.records[0]!.steps[0]!.state,'running');
});
test('上传失败保留准确阶段，禁止部署和线上验收',async()=>{
 const f=fixture();f.actions.publish=async()=>{f.calls.push('upload');throw Error('403 denied')};
 await assert.rejects(deliver(true,f.actions,f.persist),/403 denied/);
 assert.deepEqual(f.calls,['upload']);assert.equal(f.records.at(-1)!.state,'failed');
 assert.equal(f.records.at(-1)!.steps.at(-1)!.name,'publish-references');
});
test('输入变化停止后续写入，上传后的变化不触发部署',async()=>{
 for(const changeAt of [2,3]){
  const f=fixture();let reads=0;f.actions.freeze=async()=>++reads>=changeAt?'changed':'frozen';
  await assert.rejects(deliver(true,f.actions,f.persist),/不一致/);
  assert.deepEqual(f.calls,changeAt===2?[]:['upload']);assert.equal(f.records.at(-1)!.state,'failed');
 }
});
test('只有发布与线上验收都成功才登记完成',async()=>{
 const f=fixture();await deliver(true,f.actions,f.persist);
 assert.deepEqual(f.calls,['upload','deploy','verify']);assert.equal(f.records.at(-1)!.state,'completed');
 const failure=fixture();failure.actions.verify=async()=>{throw Error('resource digest mismatch')};
 await assert.rejects(deliver(true,failure.actions,failure.persist),/digest mismatch/);
 assert.equal(failure.records.at(-1)!.state,'failed');
});
test('公开素材缺失或哈希不符时拒绝进入构建与部署',async()=>{
 const site=await mkdtemp(path.join(tmpdir(),'peach-assets-'));
 try{
  const body=Buffer.from('shot'),item=(name:string,bytes=body)=>({path:'assets/screenshots/'+name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
  await mkdir(path.join(site,'assets/screenshots'),{recursive:true});
  await writeFile(path.join(site,'assets/screenshots/home.webp'),body);await writeFile(path.join(site,'assets/screenshots/stale.webp'),'old');
  await checkAssets(site,[item('home.webp')]);
  await assert.rejects(checkAssets(site,[item('home.webp'),item('missing.webp'),item('stale.webp')]),error=>/（2 个）/.test(String(error))&&/缺失 assets\/screenshots\/missing\.webp/.test(String(error))&&/不符 assets\/screenshots\/stale\.webp/.test(String(error)));
 }finally{await rm(site,{recursive:true,force:true})}
});
