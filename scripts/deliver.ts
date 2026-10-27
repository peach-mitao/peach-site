import {spawn,execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile,rename,stat} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import path from 'node:path';
import {buildBrowser} from './build_browser.ts';
import {behaviorVersion} from './behavior_version.ts';
import {checkSiteBehavior} from './check_behavior.ts';
import {captureBehavior} from './capture_behavior.ts';
import {siteScenes,siteRoutes} from './capture_site_behavior.ts';
import {publishBehavior,registrationBatches} from './publish_behavior.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
type Step={name:string;state:'running'|'completed'|'failed';started:string;finished?:string;error?:string};
export interface DeliveryReceipt{state:'running'|'planned'|'completed'|'failed';started:string;finished?:string;steps:Step[];plan?:Record<string,unknown>}
export interface DeliveryActions{
 prepare:()=>Promise<Record<string,unknown>>;freeze:()=>Promise<string>;
 publish:()=>Promise<void>;deploy:()=>Promise<void>;verify:()=>Promise<void>;
}
export async function deliver(apply:boolean,actions:DeliveryActions,persist:(receipt:DeliveryReceipt)=>Promise<void>){
 const receipt:DeliveryReceipt={state:'running',started:new Date().toISOString(),steps:[]};
 async function phase<T>(name:string,action:()=>Promise<T>){
  const step:Step={name,state:'running',started:new Date().toISOString()};receipt.steps.push(step);await persist(receipt);
  try{const result=await action();step.state='completed';step.finished=new Date().toISOString();await persist(receipt);return result}
  catch(error){step.state='failed';step.finished=new Date().toISOString();step.error=String(error);throw error}
 }
 try{
  receipt.plan=await phase('prepare',actions.prepare);
  const frozen=await phase('freeze',actions.freeze);
  receipt.plan.input_sha256=frozen;await persist(receipt);
  const stable=async()=>{if(await actions.freeze()!==frozen)throw Error('源码或构建产物与交付计划不一致，停止发布')};
  if(apply){
   await phase('before-upload',stable);await phase('publish-references',actions.publish);
   await phase('before-deploy',stable);await phase('deploy',actions.deploy);
   await phase('verify-public',actions.verify);receipt.state='completed';
  }else receipt.state='planned';
  receipt.finished=new Date().toISOString();await persist(receipt);return receipt;
 }catch(error){receipt.state='failed';receipt.finished=new Date().toISOString();await persist(receipt);throw error}
}
async function run(args:string[]){
 await new Promise<void>((resolve,reject)=>{
  const child=spawn(process.execPath,args,{cwd:root,stdio:'inherit',windowsHide:true});
  child.on('error',reject);child.on('close',code=>code===0?resolve():reject(Error(`交付子进程退出码：${code}`)));
 });
}
async function inputFingerprint(){
 const files=new Set(execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean));
 async function walk(directory:string){for(const row of await readdir(path.join(root,directory),{withFileTypes:true})){
  const name=directory+'/'+row.name;if(row.isDirectory())await walk(name);else if(row.isFile())files.add(name);
 }}
 await walk('site');await walk('.cloudflare/output');
 const hash=createHash('sha256');
 for(const name of [...files].sort())hash.update(name+'\0').update(await readFile(path.join(root,name)));
 return hash.digest('hex');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const {values}=parseArgs({options:{apply:{type:'boolean'},preview:{type:'string'},artifacts:{type:'string'}}});
 const directory=path.resolve(values.artifacts||path.join(root,'evidence'));
 const out=path.join(root,'evidence/delivery',new Date().toISOString().replaceAll(':','-')+'-'+randomUUID()+'.json');
 await mkdir(path.dirname(out),{recursive:true});console.log('交付回执：'+out);
 let version='';
 await deliver(Boolean(values.apply),{
  async prepare(){
   await buildBrowser();await run([path.join(root,'node_modules/cf/bin/cf'),'deploy','--dry-run']);
   version=await behaviorVersion();
   if(values.preview)await captureBehavior(values.preview,siteScenes,directory);
   const manifest=await checkSiteBehavior(directory,version);
   const images=[...new Set(manifest.layouts.map(row=>row.image))];
   const sizes=await Promise.all(images.map(async image=>(await stat(path.join(directory,image))).size));
   return {commit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
    dirty:Boolean(execFileSync('git',['status','--porcelain'],{cwd:root,encoding:'utf8'}).trim()),version,
    reference_count:images.length,reference_bytes:sizes.reduce((a,b)=>a+b,0),
    r2_bucket:'peach-behavior-layouts',d1_table:'behavior_layouts',
    d1_batches:registrationBatches(manifest.layouts).length,public_base:'https://peach.video/'};
  },freeze:inputFingerprint,
  async publish(){await publishBehavior(directory,'site',version,siteRoutes)},
  async deploy(){await run([path.join(root,'node_modules/cf/bin/cf'),'deploy','--prebuilt'])},
  async verify(){await run([path.join(root,'scripts/check_publish.ts'),'https://peach.video/','--http-only'])},
 },async receipt=>{await writeFile(out+'.tmp',JSON.stringify(receipt,null,2)+'\n');await rename(out+'.tmp',out)});
}
