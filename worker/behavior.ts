import {createRemoteJWKSet,jwtVerify,type JWTVerifyGetKey} from 'jose';
import {ID,pageKey,type Event,type Batch,type Site} from '../browser/assets/behavior-contract.ts';
import {BOT} from './events.ts';
import {dashboardHTML,privacyHTML} from './behavior-ui.ts';
export interface Statement {bind(...values:unknown[]):Statement;all<T=Record<string,unknown>>():Promise<{results:T[]}>;first<T=Record<string,unknown>>():Promise<T|null>;run():Promise<unknown>}
export interface Database {prepare(sql:string):Statement;batch(statements:Statement[]):Promise<unknown[]>}
interface Bucket {get(key:string):Promise<{body:ReadableStream;httpMetadata?:{contentType?:string}}|null>;delete(keys:string[]):Promise<unknown>}
export interface BehaviorEnv {BEHAVIOR?:Database;BEHAVIOR_LAYOUTS?:Bucket;BEHAVIOR_LIMIT?:{limit(options:{key:string}):Promise<{success:boolean}>};ACCESS_TEAM?:string;ACCESS_AUD?:string;ACCESS_EMAIL?:string;CF_DASHBOARD_URL?:string;BEHAVIOR_PREVIEW?:string}
const fields=['id','view','tab','at','seq','site','page','layout','viewport','width','height','lang','state','kind','target','slot','x','y','px','py','destination','referrer','utm','duration'] as const;
const kinds=new Set(['page','exposure','click','navigate','scroll','leave','unmapped']);
const origins=new Map<string,Site>([['https://peach.video','site'],['https://demo.peach.video','demo']]);
const noStore={'cache-control':'private, no-store','x-content-type-options':'nosniff'};
const local=(url:URL)=>['localhost','127.0.0.1','[::1]'].includes(url.hostname);
const preview=(url:URL,env:BehaviorEnv)=>local(url)&&env.BEHAVIOR_PREVIEW==='1';
const json=(value:unknown,status=200,headers:Record<string,string>={})=>Response.json(value,{status,headers:{...noStore,...headers}});
const text=(v:unknown)=>typeof v==='string'?v:'';
const bounded=(v:unknown,min:number,max:number)=>typeof v==='number'&&Number.isFinite(v)&&v>=min&&v<=max;
const destinationOK=(value:string)=>!value||/^(?:external:(?:github|telegram|x|other)|download|(?:site|demo|page):\/[a-z\/:_-]{0,100})$/.test(value);
export function validateBatch(value:unknown,site:Site,now=Date.now()):Batch|null{
 if(!value||typeof value!=='object')return null;
 const input=value as Record<string,unknown>;
 if(input.version!==1||!ID.test(text(input.session))||!Array.isArray(input.events)||!input.events.length||input.events.length>40)return null;
 const events:Event[]=[];
 for(const raw of input.events){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return null;
  const e=raw as Record<string,unknown>;
  if(fields.some(key=>!(key in e)))return null;
  if(['id','view','tab','site','page','layout','viewport','lang','state','kind','target','destination','referrer','utm'].some(key=>typeof e[key]!=='string'))return null;
  if(!ID.test(text(e.id))||!ID.test(text(e.view))||!ID.test(text(e.tab))||e.site!==site||!bounded(e.at,now-10*60e3,now+5*60e3)||!bounded(e.seq,0,100000)||!Number.isInteger(e.seq)||!bounded(e.width,200,10000)||!bounded(e.height,100,10000)||!['mobile','tablet','desktop'].includes(text(e.viewport))||!['zh-CN','en'].includes(text(e.lang))||!kinds.has(text(e.kind))||!/^[a-f0-9]{32,64}$/.test(text(e.layout)))return null;
  const page=text(e.page);
  if(page!==pageKey(site,page)||!/^[a-z0-9._:-]{0,80}$/.test(text(e.target))||!/^[a-z0-9._:-]{1,100}$/.test(text(e.state))||!bounded(e.slot,0,10000)||!Number.isInteger(e.slot)||!bounded(e.duration,0,24*60*60e3))return null;
  for(const key of ['x','y','px','py'])if(!bounded(e[key],-1,1))return null;
  if(!destinationOK(text(e.destination))||!/^[a-z0-9.-]{0,100}$/i.test(text(e.referrer))||!/^[\w.-]{0,32}$/.test(text(e.utm)))return null;
  // 只拣协议字段；客户端额外属性不会进入 D1。
  const result=Object.fromEntries(fields.map(key=>[key,e[key]])) as unknown as Event;
  events.push(result);
 }
 return {version:1,session:text(input.session),events};
}
async function body(request:Request):Promise<unknown>{
 if(!request.body)return null;
 const reader=request.body.getReader(),parts:Uint8Array[]=[];let length=0;
 try{for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>49152){await reader.cancel();return null}parts.push(next.value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length}
 try{return JSON.parse(new TextDecoder().decode(bytes))}catch{return null}
}
export async function collect(request:Request,env:BehaviorEnv){
 const url=new URL(request.url),origin=request.headers.get('origin')||'',dev=preview(url,env);
 let site=origins.get(origin);
 if(dev){try{if(local(new URL(origin)))site=undefined;else return json({error:'origin'},403)}catch{return json({error:'origin'},403)}}
 else if(!site)return json({error:'origin'},403);
 const cors={'access-control-allow-origin':origin,'access-control-allow-credentials':'true','vary':'Origin'};
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...noStore,...cors,'access-control-allow-methods':'POST','access-control-allow-headers':'content-type','access-control-max-age':'600'}});
 if(request.method!=='POST')return json({error:'method'},405,{...cors,allow:'POST'});
 if(!dev&&(BOT.test(request.headers.get('user-agent')||'')||/(?:^|;\s*)peach_analytics_off=1(?:;|$)/.test(request.headers.get('cookie')||'')))return new Response(null,{status:204,headers:{...noStore,...cors}});
 if(!env.BEHAVIOR)return json({error:'unavailable'},503,cors);
 if(!dev&&env.BEHAVIOR_LIMIT){const result=await env.BEHAVIOR_LIMIT.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'});if(!result.success)return json({error:'rate_limit'},429,{...cors,'retry-after':'60'})}
 const input=await body(request);
 if(dev&&input&&typeof input==='object')site=(input as {events?:{site?:Site}[]}).events?.[0]?.site;
 if(site!=='site'&&site!=='demo')return json({error:'site'},400,cors);
 const batch=validateBatch(input,site);
 if(!batch)return json({error:'invalid_batch'},400,cors);
 const statements=batch.events.map(event=>env.BEHAVIOR!.prepare(`INSERT OR IGNORE INTO behavior_events(session,${fields.join(',')}) VALUES(${new Array(fields.length+1).fill('?').join(',')})`).bind(batch.session,...fields.map(field=>event[field])));
 await env.BEHAVIOR.batch(statements);
 return new Response(null,{status:204,headers:{...noStore,...cors}});
}
const keysets=new Map<string,ReturnType<typeof createRemoteJWKSet>>();
export async function verifyAssertion(token:string,env:BehaviorEnv,keys:JWTVerifyGetKey){
 if(!env.ACCESS_AUD||!env.ACCESS_TEAM)return false;
 try{const {payload}=await jwtVerify(token,keys,{issuer:'https://'+env.ACCESS_TEAM+'.cloudflareaccess.com',audience:env.ACCESS_AUD,algorithms:['RS256']});return typeof payload.email==='string'&&(!env.ACCESS_EMAIL||payload.email===env.ACCESS_EMAIL)}catch{return false}
}
export async function authorized(request:Request,env:BehaviorEnv){
 const url=new URL(request.url);if(preview(url,env))return true;
 if(!env.ACCESS_AUD||!env.ACCESS_TEAM)return false;
 const issuer='https://'+env.ACCESS_TEAM+'.cloudflareaccess.com';
 if(!/^[a-z0-9-]+$/.test(env.ACCESS_TEAM))return false;
 let keys=keysets.get(issuer);if(!keys){keys=createRemoteJWKSet(new URL(issuer+'/cdn-cgi/access/certs'));keysets.set(issuer,keys)}
 return verifyAssertion(request.headers.get('Cf-Access-Jwt-Assertion')||'',env,keys);
}
interface Filters {days:number;site:string;page:string;layout:string;viewport:string;state:string;lang:string}
function filters(url:URL):Filters{return {days:Math.max(1,Math.min(30,Math.floor(Number(url.searchParams.get('days'))||7))),site:url.searchParams.get('site')||'site',page:url.searchParams.get('page')||'',layout:url.searchParams.get('layout')||'',viewport:url.searchParams.get('viewport')||'',state:url.searchParams.get('state')||'',lang:url.searchParams.get('lang')||''}}
function condition(filter:Filters,now:number){const parts=['at>=?','site=?'],values:unknown[]=[now-filter.days*86400e3,filter.site];for(const key of ['page','layout','viewport','state','lang'] as const)if(filter[key]){parts.push(`${key}=?`);values.push(filter[key])}return {sql:parts.join(' AND '),values}}
export async function report(db:Database,url:URL,now=Date.now()){
 const filter=filters(url),where=condition(filter,now);
 const section=url.searchParams.get('section')||'heatmap',heat=section==='heatmap',journey=section==='journey',visits=section==='visits',exact=!!(filter.layout&&filter.page&&filter.viewport&&filter.state&&filter.lang);
 if(!['site','demo'].includes(filter.site))return {error:'site'};
 const all=<T>(sql:string,values=where.values,enabled=true)=>enabled?db.prepare(sql).bind(...values).all<T>().then(r=>r.results):Promise.resolve([] as T[]);
 const [summary,targets,points,paths,exits,sessions,layouts,funnel,sources,pages]=await Promise.all([
  all(`SELECT COUNT(CASE WHEN kind='unmapped' THEN 1 END) unmapped FROM behavior_events WHERE ${where.sql}`,where.values,heat),
  all(`SELECT target,COUNT(CASE WHEN kind='click' THEN 1 END) clicks,COUNT(DISTINCT CASE WHEN kind IN ('click','exposure') THEN view END) exposures,COUNT(DISTINCT CASE WHEN kind='click' THEN view END) clicked_views FROM behavior_events WHERE ${where.sql} AND kind IN ('click','exposure') AND target<>'' GROUP BY target ORDER BY clicks DESC LIMIT 300`,where.values,heat),
  all(`SELECT target,slot,ROUND(x*10)/10.0 x,ROUND(y*10)/10.0 y,COUNT(*) hits FROM behavior_events WHERE ${where.sql} AND kind='click' AND x>=0 GROUP BY target,slot,ROUND(x*10),ROUND(y*10) ORDER BY hits DESC LIMIT 3000`,where.values,heat&&exact),
  all(`WITH cohort AS (SELECT DISTINCT session FROM behavior_events WHERE ${where.sql}),steps AS (SELECT session,site||':'||page node,LEAD(site||':'||page) OVER(PARTITION BY session ORDER BY at,seq,id) next FROM behavior_events WHERE at>=? AND kind='page' AND session IN(SELECT session FROM cohort)) SELECT node,next,COUNT(*) count FROM steps WHERE next IS NOT NULL AND node<>next GROUP BY node,next ORDER BY count DESC LIMIT 60`,[...where.values,now-filter.days*86400e3],journey),
  all(`WITH last AS (SELECT e.*,ROW_NUMBER() OVER(PARTITION BY e.session ORDER BY at DESC,seq DESC,id DESC) rank FROM behavior_events e WHERE at>=?) SELECT page,target,COUNT(*) count FROM last WHERE rank=1 AND at<? AND ${where.sql} GROUP BY page,target ORDER BY count DESC LIMIT 30`,[now-filter.days*86400e3,now-30*60e3,...where.values],journey),
  all(`WITH cohort AS(SELECT DISTINCT session FROM behavior_events WHERE ${where.sql}) SELECT session,MIN(at) start,MAX(at) last,COUNT(DISTINCT view) pages,COUNT(*) events FROM behavior_events WHERE at>=? AND session IN(SELECT session FROM cohort) GROUP BY session ORDER BY last DESC LIMIT 60`,[...where.values,now-filter.days*86400e3],visits),
  all(`SELECT site,version,page,viewport,state,lang,image,width,height,boxes,created FROM behavior_layouts WHERE site=? ORDER BY created DESC LIMIT 1000`,[filter.site],heat&&!filter.layout),
  all(`WITH cohort AS(SELECT DISTINCT session FROM behavior_events WHERE ${where.sql}),home AS (SELECT session,MIN(at) t FROM behavior_events WHERE at>=? AND site='site' AND kind='page' AND session IN(SELECT session FROM cohort) GROUP BY session),demo AS (SELECT h.session,MIN(e.at) t FROM home h JOIN behavior_events e ON e.session=h.session AND e.at>=h.t AND e.site='demo' AND e.kind='page' GROUP BY h.session),explore AS (SELECT d.session,MIN(e.at) t FROM demo d JOIN behavior_events e ON e.session=d.session AND e.at>=d.t AND e.site='demo' AND e.kind='click' GROUP BY d.session),download AS (SELECT x.session,MIN(e.at) t FROM explore x JOIN behavior_events e ON e.session=x.session AND e.at>=x.t AND e.kind='navigate' AND e.destination='download' GROUP BY x.session) SELECT (SELECT COUNT(*) FROM home) home,(SELECT COUNT(*) FROM demo) demo,(SELECT COUNT(*) FROM explore) explore,(SELECT COUNT(*) FROM download) download`,[...where.values,now-filter.days*86400e3],journey),
  all(`WITH cohort AS(SELECT DISTINCT session FROM behavior_events WHERE ${where.sql}),entry AS (SELECT session,referrer,utm,ROW_NUMBER() OVER(PARTITION BY session ORDER BY at,seq,id) rank FROM behavior_events WHERE at>=? AND session IN(SELECT session FROM cohort) AND kind='page') SELECT COALESCE(NULLIF(utm,''),NULLIF(referrer,''),'直接访问') referrer,COUNT(*) sessions FROM entry WHERE rank=1 GROUP BY 1 ORDER BY sessions DESC LIMIT 30`,[...where.values,now-filter.days*86400e3],journey),
  all('SELECT DISTINCT page FROM behavior_events WHERE site=? AND at>=? UNION SELECT DISTINCT page FROM behavior_layouts WHERE site=? ORDER BY page',[filter.site,now-filter.days*86400e3,filter.site]),
 ]);
 return {filter,summary:summary[0]||{},targets,points,paths,exits,sessions,layouts,funnel:funnel[0]||{},sources,pages,retentionDays:30};
}
export async function behaviorRequest(request:Request,env:BehaviorEnv):Promise<Response|null>{
 const url=new URL(request.url);
 if(url.pathname==='/api/behavior')return collect(request,env);
 if(url.pathname==='/privacy/analytics')return new Response(privacyHTML,{headers:{'content-type':'text/html; charset=utf-8',...noStore}});
 if(!url.pathname.startsWith('/analytics'))return null;
 if(!await authorized(request,env))return json({error:'unauthorized'},401);
 if(url.pathname==='/analytics/native'){
  let destination='https://dash.cloudflare.com/';try{const configured=new URL(env.CF_DASHBOARD_URL||destination);if(configured.origin==='https://dash.cloudflare.com')destination=configured.href}catch{}
  return new Response(null,{status:302,headers:{...noStore,location:destination}});
 }
 if(!env.BEHAVIOR)return json({error:'unavailable'},503);
 if(request.method!=='GET')return json({error:'method'},405);
 if(url.pathname==='/analytics/api/report'){
  if(!['heatmap','journey','visits'].includes(url.searchParams.get('section')||'heatmap')||!['site','demo'].includes(url.searchParams.get('site')||'site'))return json({error:'filter'},400);
  return json(await report(env.BEHAVIOR,url));
 }
 if(url.pathname==='/analytics/api/session'){
  const id=url.searchParams.get('id')||'';if(!ID.test(id))return json({error:'session'},400);
  return json((await env.BEHAVIOR.prepare('SELECT at,seq,site,page,view,tab,state,kind,target,slot,destination,duration FROM behavior_events WHERE session=? AND at>=? ORDER BY at,seq,id LIMIT 1000').bind(id,Date.now()-30*86400e3).all()).results);
 }
 if(url.pathname==='/analytics/image'){
  const f=filters(url),row=await env.BEHAVIOR.prepare('SELECT image FROM behavior_layouts WHERE site=? AND version=? AND page=? AND viewport=? AND state=? AND lang=?').bind(f.site,f.layout,f.page,f.viewport,f.state||'default',f.lang||'zh-CN').first<{image:string}>();
  if(!row||!env.BEHAVIOR_LAYOUTS)return json({error:'not_found'},404);
  const image=await env.BEHAVIOR_LAYOUTS.get(row.image);if(!image)return json({error:'not_found'},404);
  return new Response(image.body,{headers:{...noStore,'content-type':'image/webp'}});
 }
 if(url.pathname==='/analytics'||url.pathname==='/analytics/')return new Response(dashboardHTML,{headers:{...noStore,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; frame-ancestors 'none'"}});
 return json({error:'not_found'},404);
}
export async function expireBehavior(env:BehaviorEnv,now=Date.now()){
 if(!env.BEHAVIOR)return;
 const cutoff=now-30*86400e3;
 await env.BEHAVIOR.prepare('DELETE FROM behavior_events WHERE at<?').bind(cutoff).run();
 const expired=await env.BEHAVIOR.prepare('SELECT DISTINCT image FROM behavior_layouts l WHERE created<? AND NOT EXISTS(SELECT 1 FROM behavior_events e WHERE e.site=l.site AND e.layout=l.version) AND NOT EXISTS(SELECT 1 FROM behavior_layouts kept WHERE kept.image=l.image AND (kept.created>=? OR EXISTS(SELECT 1 FROM behavior_events e WHERE e.site=kept.site AND e.layout=kept.version)))').bind(cutoff,cutoff).all<{image:string}>();
 const keys=expired.results.map(row=>row.image).filter(key=>/^layouts\/[a-f0-9/.-]+\.webp$/.test(key));
 if(env.BEHAVIOR_LAYOUTS)for(let offset=0;offset<keys.length;offset+=1000)await env.BEHAVIOR_LAYOUTS.delete(keys.slice(offset,offset+1000));
 await env.BEHAVIOR.prepare('DELETE FROM behavior_layouts WHERE created<? AND NOT EXISTS(SELECT 1 FROM behavior_events e WHERE e.site=behavior_layouts.site AND e.layout=behavior_layouts.version)').bind(cutoff).run();
}
