import type {Database,Statement} from './behavior.ts';

export interface ArchiveConfig {BEHAVIOR_SQL_TOKEN?:string;BEHAVIOR_SQL_ACCOUNT?:string;BEHAVIOR_SQL_BUCKET?:string}
function literal(value:unknown){
 if(typeof value==='number'&&Number.isFinite(value))return String(value);
 if(typeof value==='string')return "'"+value.replaceAll("'","''")+"'";
 throw Error('查询参数类型无效');
}
export function archiveDatabase(env:ArchiveConfig,request:typeof fetch=fetch):Database{
 if(!env.BEHAVIOR_SQL_TOKEN||!env.BEHAVIOR_SQL_ACCOUNT||!env.BEHAVIOR_SQL_BUCKET)throw Error('日志查询未配置');
 const endpoint=`https://api.sql.cloudflarestorage.com/api/v1/accounts/${encodeURIComponent(env.BEHAVIOR_SQL_ACCOUNT)}/basin-sql/query/${encodeURIComponent(env.BEHAVIOR_SQL_BUCKET)}`;
 return {prepare(sql:string){
  let values:unknown[]=[];
  const statement:Statement={bind(...args){values=args;return statement},async all<T>(){
   if(!/^(SELECT|WITH)\b/.test(sql)||/\bbehavior_layouts\b/.test(sql))throw Error('日志查询只允许读取事件');
   let index=0;
   // 查询模板由服务端维护；所有外部值仅通过 SQL 字面量编码进入参数位置。
   const source=sql.replaceAll(/\bbehavior_events\b/g,'peach.behavior_events');
   const cutoffs:number[]=[];
   const bound=source.replaceAll('?',(_match,offset:number)=>{if(index>=values.length)throw Error('查询参数不足');const value=values[index++];if(/\bat>=\s*$/.test(source.slice(0,offset))&&typeof value==='number')cutoffs.push(value);return literal(value)});
   if(index!==values.length)throw Error('查询参数过多');
   // 采集仅允许事件时间领先接收时间五分钟；历史导入的入库时间晚于事件时间。
   // 在原始表扫描内应用对应入库时间下界，保留迟到数据并利用原生日期分区。
   const query=cutoffs.length?bound.replaceAll(/\bFROM peach\.behavior_events(?:\s+(e)\b)?/g,(_all,alias)=>`FROM (SELECT * FROM peach.behavior_events WHERE __ingest_ts>='${new Date(Math.min(...cutoffs)-300000).toISOString()}') AS ${alias||'behavior_events'}`):bound;
   const response=await request(endpoint,{method:'POST',headers:{authorization:'Bearer '+env.BEHAVIOR_SQL_TOKEN,'content-type':'application/json'},body:JSON.stringify({query}),signal:AbortSignal.timeout(60000)});
   const data=await response.json() as {success?:boolean;result?:{rows?:T[]};errors?:{code?:number}[]};
   if(!response.ok||!data.success||!Array.isArray(data.result?.rows))throw Error('日志查询失败：'+response.status+' / '+(data.errors?.map(error=>error.code).join(',')||'invalid_response'));
   return {results:data.result.rows};
  },async first<T>(){return (await statement.all<T>()).results[0]??null},async run(){throw Error('日志查询是只读服务')}};
  return statement;
 },async batch(){throw Error('日志写入必须通过 Stream')}};
}
