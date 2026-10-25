import test from 'node:test';
import assert from 'node:assert/strict';
import {createReportCache,REPORT_TTL,type ReportBucket} from '../worker/report-cache.ts';
function storage(){
 const objects=new Map<string,{body:string;etag:string}>();let revision=0;
 const bucket:ReportBucket={async get(key){const row=objects.get(key);return row?{body:new Blob([row.body]).stream(),etag:row.etag}:null},async put(key,body,options){const prior=objects.get(key),condition=options?.onlyIf;if(condition?.etagMatches&&condition.etagMatches!==prior?.etag||condition?.etagDoesNotMatch==='*'&&prior)return null;objects.set(key,{body,etag:String(++revision)});return {etag:String(revision)}}};
 return {bucket,objects};
}
const request=(owner='owner',query='site=site&section=heatmap')=>new Request('https://peach.video/analytics/api/report?'+query,{headers:{'Cf-Access-Jwt-Assertion':owner}});
test('完成的汇总跨实例复用，刷新不重复执行 SQL，身份和筛选仍隔离',async()=>{
 let now=1000000,loads=0;const {bucket}=storage(),load=async()=>({events:++loads}),first=createReportCache(()=>now);
 const a=await first(request(),bucket,load);assert.equal(a.headers.get('x-peach-report-cache'),'generated');assert.deepEqual(await a.json(),{events:1});
 const cold=createReportCache(()=>now),hit=await cold(request('owner','section=heatmap&site=site'),bucket,load);assert.equal(hit.headers.get('x-peach-report-cache'),'r2');assert.deepEqual(await hit.json(),{events:1});assert.equal(loads,1);
 assert.deepEqual(await (await cold(request('other'),bucket,load)).json(),{events:2});assert.deepEqual(await (await cold(request('owner','site=demo&section=heatmap'),bucket,load)).json(),{events:3});
 now+=REPORT_TTL+1;assert.deepEqual(await (await cold(request(),bucket,load)).json(),{events:4});assert.equal(loads,4);
});
test('并发冷请求只允许一个实例生成；失败租约过期后可恢复',async()=>{
 let now=1000000,started!:()=>void,finish!:()=>void;const begun=new Promise<void>(resolve=>started=resolve),hold=new Promise<void>(resolve=>finish=resolve),{bucket}=storage();
 const first=createReportCache(()=>now)(request(),bucket,async()=>{started();await hold;return {ok:true}});await begun;
 const busy=await createReportCache(()=>now)(request(),bucket,async()=>assert.fail('重复执行了 SQL'));assert.equal(busy.status,503);assert.equal(busy.headers.get('retry-after'),'30');finish();assert.deepEqual(await (await first).json(),{ok:true});
 now+=REPORT_TTL+1;await assert.rejects(createReportCache(()=>now)(request(),bucket,async()=>{throw Error('query failed')}),/query failed/);
 now+=120001;assert.deepEqual(await (await createReportCache(()=>now)(request(),bucket,async()=>({recovered:true}))).json(),{recovered:true});
});
test('缓存不可用时不放大为无保护的 SQL 扫描',async()=>{
 const bucket:ReportBucket={async get(){throw Error('storage down')},async put(){return {}}};
 await assert.rejects(createReportCache()(request(),bucket,async()=>assert.fail('缓存故障时扫描了日志')),/storage down/);
});
