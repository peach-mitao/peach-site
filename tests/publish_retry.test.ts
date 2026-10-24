import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {retryTransient,ensureReference} from '../scripts/publish_behavior.ts';
test('临时网络错误有界退避，权限错误直接返回',async()=>{
 let attempts=0;const delays:number[]=[];
 assert.equal(await retryTransient(async()=>{if(++attempts<3)throw Error('500 Internal Server Error');return 'ok'},async ms=>{delays.push(ms)}),'ok');assert.equal(attempts,3);assert.deepEqual(delays,[2000,4000]);
 attempts=0;await assert.rejects(retryTransient(async()=>{attempts++;throw Error('fetch failed')},async()=>{}),/fetch failed/);assert.equal(attempts,5);
 attempts=0;await assert.rejects(retryTransient(async()=>{attempts++;throw Error('403 Authentication error')},async()=>{}),/403/);assert.equal(attempts,1);
});
test('参考对象回读通过即可复用，缺失对象上传后仍核对正文',async()=>{
 const body=Buffer.from('reference'),image='layouts/version/'+createHash('sha256').update(body).digest('hex')+'.webp';let writes=0,reads=0;
 assert.equal(await ensureReference(image,async()=>body,async()=>{writes++}),false);assert.equal(writes,0);
 assert.equal(await ensureReference(image,async()=>{if(reads++===0)throw Error('404 Not Found');return body},async()=>{writes++}),true);assert.equal(writes,1);assert.equal(reads,2);
 await assert.rejects(ensureReference(image,async()=>Buffer.from('wrong'),async()=>{writes++}),/指纹不一致/);assert.equal(writes,1);
 await assert.rejects(ensureReference(image,async()=>{throw Error('403 Authentication error')},async()=>{writes++}),/403/);assert.equal(writes,1);
});
