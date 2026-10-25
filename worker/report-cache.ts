interface StoredObject {body:ReadableStream;etag?:string}
export interface ReportBucket {
 get(key:string):Promise<StoredObject|null>;
 put?(key:string,value:string,options?:{onlyIf?:{etagMatches?:string;etagDoesNotMatch?:string};httpMetadata?:{contentType:string}}):Promise<unknown>;
}
interface Entry {body:string;created:number;expires:number}
const headers={'cache-control':'private, no-store','content-type':'application/json','x-content-type-options':'nosniff'};
export const REPORT_TTL=30*60e3;
const LEASE_TTL=2*60e3;
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes),value=>value.toString(16).padStart(2,'0')).join('');
export function createReportCache(clock:()=>number=Date.now){
 const completed=new Map<string,Entry>();
 return async function cached(request:Request,bucket:ReportBucket|undefined,load:()=>Promise<unknown>){
  const url=new URL(request.url);url.searchParams.sort();
  const identity=(request.headers.get('Cf-Access-Jwt-Assertion')||'')+'\n'+url.origin+url.pathname+url.search;
  const key='reports/v1/'+hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)));
  const now=clock();for(const [key,row] of completed)if(row.expires<=now)completed.delete(key);
  const response=(row:Entry,state:string)=>new Response(row.body,{headers:{...headers,'x-peach-report-generated-at':String(row.created),'x-peach-report-expires-at':String(row.expires),'x-peach-report-cache':state}});
  const remember=(row:Entry)=>{if(completed.size>=20)completed.delete(completed.keys().next().value!);completed.set(key,row)};
  const memory=completed.get(key);if(memory)return response(memory,'memory');
  if(bucket?.put){
   const stored=await bucket.get(key);
   if(stored){const row=await new Response(stored.body).json() as Entry;if(typeof row.body==='string'&&row.body.length<=500000&&row.created<=now&&row.expires>now&&row.expires-row.created<=REPORT_TTL){remember(row);return response(row,'r2')}}
   const leaseKey=key+'.lease',lease=await bucket.get(leaseKey);
   if(lease){const row=await new Response(lease.body).json() as {until:number};if(row.until>now)return Response.json({error:'report_pending'},{status:503,headers:{...headers,'retry-after':'30'}})}
   const claimed=await bucket.put(leaseKey,JSON.stringify({until:now+LEASE_TTL}),{onlyIf:lease?.etag?{etagMatches:lease.etag}:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
   if(claimed===null)return Response.json({error:'report_pending'},{status:503,headers:{...headers,'retry-after':'30'}});
  }
  const body=JSON.stringify(await load()),created=clock(),row={body,created,expires:created+REPORT_TTL};
  // 只保存完成的结果；不共享请求的 Promise、Response 或 I/O 对象。
  if(body.length<=500000){if(bucket?.put)await bucket.put(key,JSON.stringify(row),{httpMetadata:{contentType:'application/json'}});remember(row)}
  return response(row,'generated');
 };
}
