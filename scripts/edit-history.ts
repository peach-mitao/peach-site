import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';

type State={version:1;states:string[];cursor:number};
type Journal=State&{pending?:{before:string;after:string;next:State}};
const locks=new Map<string,Promise<unknown>>();
const revision=(html:string)=>createHash('sha256').update(html).digest('hex');
export class EditConflict extends Error {}
export function historyFile(file:string){
  const directory=path.dirname(file);
  return path.basename(directory)==='site'?path.join(directory,'..','evidence','edit-history.json'):file+'.edit-history.json';
}
export async function serialize<T>(file:string,operation:()=>Promise<T>):Promise<T>{
  const prior=locks.get(file)??Promise.resolve();
  const next=prior.catch(()=>{}).then(operation);locks.set(file,next);
  try{return await next}finally{if(locks.get(file)===next)locks.delete(file)}
}
async function atomic(file:string,text:string){
  await writeFile(file+'.tmp',text,'utf8');await rename(file+'.tmp',file);
}
function valid(state:State){
  return state?.version===1&&Array.isArray(state.states)&&state.states.length>0&&state.states.length<=51
    &&state.states.every(text=>typeof text==='string')&&Number.isInteger(state.cursor)&&state.cursor>=0&&state.cursor<state.states.length;
}
async function store(file:string,state:Journal){
  const target=historyFile(file);await mkdir(path.dirname(target),{recursive:true});await atomic(target,JSON.stringify(state));
}
async function load(file:string,current:string):Promise<State>{
  let state:Journal;
  try{state=JSON.parse(await readFile(historyFile(file),'utf8'))}
  catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return {version:1,states:[current],cursor:0};throw error}
  if(!valid(state))throw Error('撤销记录格式无效，未修改源文件');
  if(state.pending){
    if(!valid(state.pending.next)||typeof state.pending.before!=='string'||typeof state.pending.after!=='string')throw Error('撤销事务格式无效，未修改源文件');
    const settled=current===state.pending.after?state.pending.next:{version:1 as const,states:state.states,cursor:state.cursor};
    await store(file,settled);state=settled;
  }
  // 外部修改成为新的起点，旧记录不覆盖当前文件。
  return current===state.states[state.cursor]?state:{version:1,states:[current],cursor:0};
}
const summary=(state:State,current:string)=>({revision:revision(current),undoCount:state.cursor,redoCount:state.states.length-state.cursor-1});
export async function historyStatus(file:string){
  return serialize(file,async()=>{const html=await readFile(file,'utf8');return summary(await load(file,html),html)});
}
async function commit(file:string,before:string,after:string,state:State,next:State){
  if(await readFile(file,'utf8')!==before)throw new EditConflict('源文件已被其他操作修改，请刷新后重试');
  // 先记可恢复事务；中断后按源文件内容决定保留哪一端。
  await store(file,{...state,pending:{before,after,next}});
  try{await atomic(file,after)}catch(error){await store(file,state).catch(()=>{});throw error}
  // 日志已包含 next；收尾写入失败时，下一次读取可完成事务。
  await store(file,next).catch(()=>{});
  return summary(next,after);
}
export async function saveWithHistory(file:string,before:string,after:string){
  if(before===after)return;
  const state=await load(file,before),states=[...state.states.slice(0,state.cursor+1),after].slice(-51);
  await commit(file,before,after,state,{version:1,states,cursor:states.length-1});
}
export async function travel(file:string,direction:'undo'|'redo',expected:unknown){
  const html=await readFile(file,'utf8');
  if(typeof expected!=='string')return {status:400,json:{error:'撤销请求缺少源文件版本，请刷新后重试'}};
  if(expected!==revision(html))return {status:409,json:{error:'源文件已被其他操作修改，未撤销；请刷新后重试'}};
  const state=await load(file,html),cursor=state.cursor+(direction==='undo'?-1:1);
  if(cursor<0||cursor>=state.states.length)return {status:409,json:{error:direction==='undo'?'没有可撤销的保存':'没有可重做的保存'}};
  const history=await commit(file,html,state.states[cursor],state,{...state,cursor});
  return {status:200,json:{ok:true,history}};
}
export function sameRevision(html:string,expected:unknown){return expected===undefined||expected===revision(html)}
export async function currentHistory(file:string){const html=await readFile(file,'utf8');return summary(await load(file,html),html)}
