import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {createLocalJWKSet,generateKeyPair,exportJWK,SignJWT} from 'jose';
import {behaviorStorage} from '../scripts/behavior_storage.ts';
import {validateBatch,collect,report,authorized,verifyAssertion,expireBehavior,behaviorRequest,type BehaviorEnv} from '../worker/behavior.ts';
import {pageKey,destination,type Event} from '../browser/assets/behavior-contract.ts';
import type {Layout} from '../browser/assets/behavior-contract.ts';
import {registrationBatches} from '../scripts/publish_behavior.ts';
import {checkBehaviorArtifacts,type Artifacts} from '../scripts/behavior_artifacts.ts';
const id=()=>randomBytes(16).toString('hex'),now=Date.now();
function event(patch:Partial<Event>={}):Event{return {id:id(),view:id(),tab:id(),at:now-60000,seq:0,site:'site',page:'/',layout:'a'.repeat(64),viewport:'desktop',width:1440,height:1000,lang:'zh-CN',state:'default',kind:'page',target:'',slot:0,x:-1,y:-1,px:-1,py:-1,destination:'',referrer:'',utm:'',duration:0,...patch}}
const payload=(events:Event[],session=id())=>({version:1,session,events});
const request=(value:unknown,origin='https://peach.video',headers:Record<string,string>={})=>new Request('https://peach.video/api/behavior',{method:'POST',headers:{origin,'user-agent':'Mozilla/5.0',...headers},body:JSON.stringify(value)});
test('统计入口需要授权，原生面板跳转只允许 Cloudflare 控制台',async()=>{
 assert.equal((await behaviorRequest(new Request('https://peach.video/analytics/'),{}))?.status,401);
 for(const [value,expected] of [['https://dash.cloudflare.com/example/dashboard','https://dash.cloudflare.com/example/dashboard'],['https://untrusted.example/','https://dash.cloudflare.com/']]){
  const response=await behaviorRequest(new Request('http://127.0.0.1/analytics/native'),{BEHAVIOR_PREVIEW:'1',CF_DASHBOARD_URL:value});assert.equal(response?.status,302);assert.equal(response?.headers.get('location'),expected);
 }
});
async function insert(env:BehaviorEnv,events:Event[],session=id()){
 // 报告夹具包含超过采集窗口的历史记录，直接写入本用例的临时数据库。
 for(const row of events){const fields=Object.keys(row) as (keyof Event)[];await env.BEHAVIOR!.prepare(`INSERT INTO behavior_events(session,${fields.join(',')}) VALUES(${new Array(fields.length+1).fill('?').join(',')})`).bind(session,...fields.map(key=>row[key])).run()}return session;
}
test('路由和下载目的地保留功能，不携带作品身份',()=>{
 assert.equal(pageKey('demo','/works/PRIVATE-TITLE'),'/works/:id');assert.equal(pageKey('demo','/performers/123'),'/performers/:id');assert.equal(pageKey('demo','/performers/:id'),'/performers/:id');
 assert.equal(destination(new URL('https://github.com/owner/repo/releases/download/v1/package.dmg')),'download');
 assert.equal(destination(new URL('https://demo.peach.video/assets/123?search=private')),'demo:/assets/:id');
});
test('批次校验拒绝越界与原始 URL，额外字段不落库',()=>{
 const row=event(),valid=payload([{...row,input:'private'} as Event]);assert.equal(validateBatch(valid,'site',now)?.events.length,1);assert.equal('input' in validateBatch(valid,'site',now)!.events[0]!,false);
 for(const patch of [{site:'demo'},{page:'/assets/title'},{destination:'https://secret.example'},{referrer:'example.com/private'},{target:{}},{x:2},{at:now-20*60000},{layout:'not-a-hash'}])assert.equal(validateBatch(payload([{...row,...patch} as Event]),'site',now),null);
 assert.equal(validateBatch(payload(Array.from({length:41},()=>event())),'site',now),null);
});
test('写入幂等、来源隔离、停用与机器人过滤均作用于真实 SQLite',async()=>{
 const {database,sqlite}=behaviorStorage(':memory:'),env={BEHAVIOR:database},row=event(),body=payload([row]);
 try{
  assert.equal((await collect(request(body),env)).status,204);assert.equal((await collect(request(body),env)).status,204);assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM behavior_events').get()?.n,1);
  assert.equal((await collect(request(payload([event()]),'https://evil.example'),env)).status,403);
  const ignoredHeaders:Record<string,string>[]=[{'user-agent':'Googlebot'},{cookie:'peach_analytics_off=1'}];
  for(const headers of ignoredHeaders)assert.equal((await collect(request(payload([event()]),'https://peach.video',headers),env)).status,204);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM behavior_events').get()?.n,1);
  assert.equal((await collect(request(payload([event()]),'https://peach.video'),{...env,BEHAVIOR_LIMIT:{async limit(){return {success:false}}}})).status,429);
  assert.equal((await collect(new Request('https://peach.video/api/behavior',{method:'POST',headers:{origin:'https://peach.video'},body:'x'.repeat(50000)}),env)).status,400);
 }finally{sqlite.close()}
});
test('功能点击率按页面去重；热力图必须选择具体布局',async()=>{
 const {database,sqlite}=behaviorStorage(':memory:'),env={BEHAVIOR:database},view=id();
 try{
  await insert(env,[event({view,kind:'exposure',target:'download.primary',slot:0}),event({view,kind:'exposure',target:'download.primary',slot:1}),event({view,kind:'click',target:'download.primary',slot:0,x:.5,y:.5}),event({view,kind:'click',target:'download.primary',slot:1,x:.5,y:.5})]);
  const base='https://peach.video/analytics/api/report?section=heatmap&site=site',result=await report(database,new URL(base),now);assert.deepEqual(result.targets,[{target:'download.primary',clicks:2,exposures:1,clicked_views:1}]);assert.deepEqual(result.points,[]);
  const exact=await report(database,new URL(base+'&layout='+ 'a'.repeat(64)+'&page=/&viewport=desktop&state=default&lang=zh-CN'),now);assert.ok(exact.points);assert.equal(exact.points.length,2);
 }finally{sqlite.close()}
});
test('跨站会话只在真正的最后页面计入离开，活动会话不计入',async()=>{
 const {database,sqlite}=behaviorStorage(':memory:'),env={BEHAVIOR:database},session=id();
 try{
  await insert(env,[event({at:now-60*60000,referrer:'search.example'})],session);
  await insert(env,[event({site:'demo',page:'/stats',at:now-50*60000}),event({site:'demo',page:'/stats',at:now-45*60000,kind:'leave',target:'region.content'})],session);
  await insert(env,[event({at:now-60000})]);
  const site=await report(database,new URL('https://peach.video/analytics/api/report?section=journey&site=site'),now);assert.deepEqual(site.exits,[]);
  const demo=await report(database,new URL('https://peach.video/analytics/api/report?section=journey&site=demo'),now);assert.deepEqual(demo.exits,[{page:'/stats',target:'region.content',count:1}]);assert.deepEqual(demo.sources,[{referrer:'search.example',sessions:1}]);assert.deepEqual(demo.paths,[{node:'site:/',next:'demo:/stats',count:1}]);
 }finally{sqlite.close()}
});
test('转化漏斗遵守事件顺序与筛选，下载先于演示不算完成',async()=>{
 const {database,sqlite}=behaviorStorage(':memory:'),env={BEHAVIOR:database};
 try{
  for(const early of [true,false]){const session=id();await insert(env,[event({at:now-600000}),event({at:now-(early?599000:596000),kind:'navigate',destination:'download'})],session);await insert(env,[event({site:'demo',at:now-598000}),event({site:'demo',at:now-597000,kind:'click',target:'link.stats'})],session)}
  const anchor=id();await insert(env,[event({at:now-600000})],anchor);await insert(env,[event({site:'demo',at:now-598000}),event({site:'demo',at:now-597000,kind:'click',target:'link.stats'}),event({site:'demo',at:now-596000,kind:'click',target:'download.primary',destination:'page:/'})],anchor);
  const data=await report(database,new URL('https://peach.video/analytics/api/report?section=journey'),now);assert.deepEqual(data.funnel,{home:3,demo:3,explore:3,download:1});
  const empty=await report(database,new URL('https://peach.video/analytics/api/report?section=journey&viewport=mobile'),now);assert.deepEqual(empty.funnel,{home:0,demo:0,explore:0,download:0});
 }finally{sqlite.close()}
});
test('Access 校验拒绝缺配置、伪造 JWT 和错误 audience',async()=>{
 const env={ACCESS_TEAM:'unit',ACCESS_AUD:'own-audience'},keys=await generateKeyPair('RS256'),jwk=await exportJWK(keys.publicKey),resolver=createLocalJWKSet({keys:[{...jwk,kid:'test'}]});
 const token=await new SignJWT({email:'owner@example.com'}).setProtectedHeader({alg:'RS256',kid:'test'}).setIssuer('https://unit.cloudflareaccess.com').setAudience(env.ACCESS_AUD).setExpirationTime('5m').sign(keys.privateKey);
 assert.equal(await verifyAssertion(token,env,resolver),true);assert.equal(await verifyAssertion(token,{...env,ACCESS_AUD:'other'},resolver),false);assert.equal(await verifyAssertion(token+'x',env,resolver),false);
 assert.equal(await authorized(new Request('https://worker.example/analytics'),{BEHAVIOR_PREVIEW:'1'}),false);
 assert.equal(await authorized(new Request('http://127.0.0.1/analytics'),{BEHAVIOR_PREVIEW:'1'}),true);
});
test('保留期清理只删到期数据与已无引用的参考图',async()=>{
 const {database,sqlite}=behaviorStorage(':memory:'),deleted:string[][]=[];
 try{
  sqlite.prepare('INSERT INTO behavior_layouts VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('site','b'.repeat(64),'/','desktop','default','zh-CN','layouts/'+ 'b'.repeat(64)+'/c.webp',1440,1000,'[]',now-31*86400e3);
  await expireBehavior({BEHAVIOR:database,BEHAVIOR_LAYOUTS:{async get(){return null},async delete(keys){deleted.push(keys)}}},now);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM behavior_layouts').get()?.n,0);assert.equal(deleted.flat().length,1);
 }finally{sqlite.close()}
});

test('布局登记按请求体积拆批并保留全部页面，单页过大时拒绝发布',()=>{
 const layouts:Layout[]=Array.from({length:65},(_,index)=>({site:'demo',version:'a'.repeat(64),page:'/page-'+index,viewport:'desktop',state:'default',lang:'zh-CN',image:'layouts/'+ 'a'.repeat(64)+'/'+ 'b'.repeat(64)+'.webp',width:1440,height:1000,created:now,boxes:[{target:'action.run',slot:0,x:0,y:0,width:100,height:40}]}));
 const batches=registrationBatches(layouts,2400);assert.ok(batches.length>1);assert.ok(batches.every(batch=>Buffer.byteLength(JSON.stringify(batch))<=2400));assert.deepEqual(batches.flat().map(statement=>statement.params[2]),layouts.map(row=>row.page));assert.throws(()=>registrationBatches(layouts,100),/元数据过大/);
});

test('保留期清理保留仍被新布局引用的同一张参考图',async()=>{
 const {database,sqlite}=behaviorStorage(':memory:'),deleted:string[][]=[],image='layouts/'+ 'b'.repeat(64)+'/c.webp';
 try{
  const statement=sqlite.prepare('INSERT INTO behavior_layouts VALUES(?,?,?,?,?,?,?,?,?,?,?)');
  statement.run('site','b'.repeat(64),'/','desktop','default','zh-CN',image,1440,1000,'[]',now-31*86400e3);
  statement.run('site','b'.repeat(64),'/en/','desktop','default','en',image,1440,1000,'[]',now);
  await expireBehavior({BEHAVIOR:database,BEHAVIOR_LAYOUTS:{async get(){return null},async delete(keys){deleted.push(keys)}}},now);
  assert.equal(sqlite.prepare('SELECT COUNT(*) n FROM behavior_layouts').get()?.n,1);assert.deepEqual(deleted,[]);
 }finally{sqlite.close()}
});

test('发布产物门槛拒绝遗漏路由、草稿截图、未映射控件和内容漂移',async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'peach-behavior-')),version='a'.repeat(64),body=await sharp({create:{width:1440,height:1000,channels:3,background:'#fff'}}).webp().toBuffer(),hash=createHash('sha256').update(body).digest('hex'),image=`layouts/${version}/${hash}.webp`;
 const rows:Layout[]=(['desktop','mobile'] as const).map(viewport=>({site:'site',version,page:'/',viewport,state:'default',lang:'zh-CN',image,width:1440,height:1000,created:now,boxes:[{target:'action.run',slot:0,x:0,y:0,width:100,height:40}]}));
 const original:Artifacts={version:1,complete:true,layouts:rows,coverage:['desktop','mobile'].map(viewport=>({route:'/',viewport,unmapped:[]}))};
 const save=(manifest:Artifacts)=>writeFile(path.join(directory,'behavior-layouts-site.json'),JSON.stringify(manifest));
 try{
  await mkdir(path.dirname(path.join(directory,image)),{recursive:true});await writeFile(path.join(directory,image),body);await save(original);await checkBehaviorArtifacts(directory,'site',version,['/']);
  await assert.rejects(checkBehaviorArtifacts(directory,'site',version,['/','/missing/']),/缺少页面覆盖/);
  await save({...original,complete:false});await assert.rejects(checkBehaviorArtifacts(directory,'site',version,['/']),/未完整生成/);
  await save({...original,coverage:[{route:'/',viewport:'desktop',unmapped:[{tag:'BUTTON'}]}]});await assert.rejects(checkBehaviorArtifacts(directory,'site',version,['/']),/未映射控件/);
  await save({...original,layouts:rows.map(row=>({...row,height:900}))});await assert.rejects(checkBehaviorArtifacts(directory,'site',version,['/']),/实际尺寸/);
  await save(original);await assert.rejects(checkBehaviorArtifacts(directory,'site','b'.repeat(64),['/']),/当前构建不一致/);
  await writeFile(path.join(directory,image),'tampered');await assert.rejects(checkBehaviorArtifacts(directory,'site',version,['/']),/内容指纹不一致/);
 }finally{await rm(directory,{recursive:true,force:true})}
});
