import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import sharp from 'sharp';
import type {Layout,Site} from '../browser/assets/behavior-contract.ts';
export interface Artifacts {version:1;complete:boolean;layouts:Layout[];coverage:{route:string;viewport:string;unmapped:unknown[]}[]}
export async function checkBehaviorArtifacts(directory:string,site:Site,version:string,routes:string[]){
 const manifest=JSON.parse(await readFile(path.join(directory,`behavior-layouts-${site}.json`),'utf8')) as Artifacts;
 if(manifest.version!==1||manifest.complete!==true||!manifest.layouts?.length||!Array.isArray(manifest.coverage))throw Error('参考布局未完整生成');
 if(manifest.coverage.some(row=>!Array.isArray(row.unmapped)||row.unmapped.length))throw Error('发现未映射控件，请同步追踪契约后重新生成参考图');
 for(const route of routes)for(const viewport of ['desktop','mobile'])if(!manifest.coverage.some(row=>row.route===route&&row.viewport===viewport))throw Error(`缺少页面覆盖：${route} ${viewport}`);
 const identities=new Set<string>();
 for(const row of manifest.layouts){
  if(row.site!==site||row.version!==version||!/^[a-f0-9]{64}$/.test(row.version)||!/^layouts\/[a-f0-9]{64}\/[a-f0-9]{64}\.webp$/.test(row.image)||!row.image.startsWith(`layouts/${version}/`)||!Number.isSafeInteger(row.width)||!Number.isSafeInteger(row.height)||row.width<=0||row.height<=0||!Array.isArray(row.boxes)||!row.boxes.length)throw Error('参考布局与当前构建不一致');
  const identity=[row.page,row.viewport,row.state,row.lang].join('|');if(identities.has(identity))throw Error('参考布局身份重复');identities.add(identity);
  for(const box of row.boxes)if(!/^[a-z][a-z0-9._:-]{0,79}$/.test(box.target)||![box.x,box.y,box.width,box.height,box.slot].every(Number.isFinite)||box.width<=0||box.height<=0||box.slot<0)throw Error('参考元素坐标无效');
  const body=await readFile(path.join(directory,row.image)),hash=createHash('sha256').update(body).digest('hex');if(!row.image.endsWith('/'+hash+'.webp'))throw Error('参考图内容指纹不一致');
  const metadata=await sharp(body).metadata();if(metadata.format!=='webp'||metadata.width!==row.width||metadata.height!==row.height)throw Error('参考图实际尺寸与登记坐标不一致');
 }
 return manifest;
}
