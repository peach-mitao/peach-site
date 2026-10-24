// 只发布通过契约核验的参考图；写入不含访客事件。
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkBehaviorArtifacts} from './behavior_artifacts.ts';
import type {Site,Layout} from '../browser/assets/behavior-contract.ts';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function retryTransient<T>(operation:()=>Promise<T>,sleep:(ms:number)=>Promise<void>=ms=>new Promise(resolve=>setTimeout(resolve,ms))):Promise<T>{
 for(let attempt=0;;attempt++)try{return await operation()}catch(error){
  if(attempt>=4||!/fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|\b429\b|\b50[0234]\b|internal error/i.test(String(error)))throw error;
  console.error(`Cloudflare 临时请求失败，${(attempt+1)*2} 秒后重试 ${attempt+1}/4`);await sleep((attempt+1)*2000);
 }
}
async function cf(args:string[]){return retryTransient(()=>new Promise<Buffer>((resolve,reject)=>{const child=spawn(process.execPath,[path.join(root,'node_modules/cf/bin/cf'),...args,'--quiet'],{cwd:root,stdio:['ignore','pipe','pipe'],windowsHide:true}),parts:Buffer[]=[],errors:Buffer[]=[];child.stdout.on('data',chunk=>parts.push(chunk));child.stderr.on('data',chunk=>errors.push(chunk));child.on('error',reject);child.on('close',code=>code===0?resolve(Buffer.concat(parts)):reject(Error('cf 退出码：'+code+' '+Buffer.concat(errors).toString('utf8'))))}))}
export async function ensureReference(image:string,load:()=>Promise<Buffer>,upload:()=>Promise<unknown>){
 let body:Buffer,uploaded=false;
 try{body=await load()}catch(error){if(!/\b404\b|NoSuchKey|specified key does not exist|object not found/i.test(String(error)))throw error;await upload();body=await load();uploaded=true}
 if(!image.endsWith('/'+createHash('sha256').update(body).digest('hex')+'.webp'))throw Error('R2 回读指纹不一致：'+image);
 return uploaded;
}
export function registrationBatches(layouts:Layout[],limit=512*1024){
 const chunks:{sql:string;params:unknown[]}[][]=[];let current:{sql:string;params:unknown[]}[]=[],bytes=2;
 for(const row of layouts){const statement={sql:'INSERT OR REPLACE INTO behavior_layouts(site,version,page,viewport,state,lang,image,width,height,boxes,created) VALUES(?,?,?,?,?,?,?,?,?,?,?)',params:[row.site,row.version,row.page,row.viewport,row.state,row.lang,row.image,row.width,row.height,JSON.stringify(row.boxes),row.created]},size=Buffer.byteLength(JSON.stringify(statement))+1;if(size+2>limit)throw Error('单页布局元数据过大，请收窄截图场景');if(current.length&&(bytes+size>limit||current.length>=30)){chunks.push(current);current=[];bytes=2}current.push(statement);bytes+=size}
 if(current.length)chunks.push(current);return chunks;
}
export async function publishBehavior(directory:string,site:Site,version:string,routes:string[]){
 const manifest=await checkBehaviorArtifacts(directory,site,version,routes);
 let completed=0;
 for(const row of manifest.layouts){await ensureReference(row.image,()=>cf(['r2','objects','get',row.image,'--bucket-name','peach-behavior-layouts']),()=>cf(['r2','objects','put',row.image,'--bucket-name','peach-behavior-layouts','--file',path.join(directory,row.image),'--content-type','image/webp']));completed++;if(completed%10===0||completed===manifest.layouts.length)console.log(`已回读核对 ${completed}/${manifest.layouts.length} 份 ${site} 参考图`)}
 await mkdir(path.join(root,'evidence'),{recursive:true});const file=path.join(root,'evidence/behavior-register.json');
 for(const batch of registrationBatches(manifest.layouts)){await writeFile(file,JSON.stringify(batch));await cf(['d1','query','d81eb012-a8c9-4893-999c-33c31467ac75','--batch','@'+file])}
 const queries=manifest.layouts.map(row=>({sql:'SELECT image,width,height,boxes FROM behavior_layouts WHERE site=? AND version=? AND page=? AND viewport=? AND state=? AND lang=?',params:[row.site,row.version,row.page,row.viewport,row.state,row.lang]}));
 for(let offset=0;offset<queries.length;offset+=30){await writeFile(file,JSON.stringify(queries.slice(offset,offset+30)));const result=JSON.parse((await cf(['d1','query','d81eb012-a8c9-4893-999c-33c31467ac75','--batch','@'+file])).toString('utf8')) as {success:boolean;results:{image:string;width:number;height:number;boxes:string}[]}[];const expected=manifest.layouts.slice(offset,offset+30);if(result.length!==expected.length||result.some((entry,index)=>{const row=expected[index]!,actual=entry.results?.[0];return !entry.success||entry.results.length!==1||!actual||actual.image!==row.image||actual.width!==row.width||actual.height!==row.height||actual.boxes!==JSON.stringify(row.boxes)}))throw Error('D1 布局登记回读不一致')}
 console.log(`已发布并回读核对 ${manifest.layouts.length} 份 ${site} 页面参考图`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const [directory,site,version]=process.argv.slice(2);if(!directory||!['site','demo'].includes(site||'')||!/^[a-f0-9]{64}$/.test(version||''))throw Error('请提供参考图目录、网站标识与当前构建指纹');
 const manifest=JSON.parse(await readFile(path.join(directory,`behavior-layouts-${site}.json`),'utf8'));
 await publishBehavior(directory,site as Site,version!,manifest.coverage.map((row:{route:string})=>row.route));
}
