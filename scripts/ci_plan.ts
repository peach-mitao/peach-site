import {execFileSync,spawnSync} from 'node:child_process';
import {appendFileSync} from 'node:fs';
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import path from 'node:path';

export function runtimeRequired(event:string,paths:readonly string[]){
  return event==='workflow_dispatch'||!paths.length||paths.some(name=>
    !/^(?:README(?:\.[\w-]+)?\.md|CONTRIBUTING\.md|\.github\/[^/]+\.md|docs\/.*\.md)$/.test(name));
}
export function changedPaths(base:string){
  if(!/^[a-f0-9]{40}$/.test(base)||/^0+$/.test(base))throw Error('未取得有效比较基线');
  return execFileSync('git',['diff','--name-only','-z',base,'HEAD'],{encoding:'utf8'}).split('\0').filter(Boolean);
}
interface WorkflowRun{head_sha:string;head_branch:string;event:string;conclusion:string}
export function verifiedBase(runs:readonly WorkflowRun[],head:string,branch:string,ancestor:(sha:string)=>boolean){
  const run=runs.find(row=>row.event==='push'&&row.head_branch===branch&&row.conclusion==='success'
    &&/^[a-f0-9]{40}$/.test(row.head_sha)&&row.head_sha!==head&&ancestor(row.head_sha));
  if(!run)throw Error('未取得当前提交祖先上的成功验证');
  return run.head_sha;
}
function githubBase(){
  const repository=process.env.GITHUB_REPOSITORY||'',branch=process.env.GITHUB_REF_NAME||'';
  const workflow=process.env.GITHUB_WORKFLOW_REF?.match(/\/\.github\/workflows\/([^/@]+)@/)?.[1];
  if(!/^[\w.-]+\/[\w.-]+$/.test(repository)||!workflow||!/^[-\w.]+\.ya?ml$/.test(workflow)||!branch)throw Error('工作流身份未取得');
  const query=new URLSearchParams({branch,event:'push',status:'success',per_page:'20'});
  const result=JSON.parse(execFileSync('gh',['api',`repos/${repository}/actions/workflows/${workflow}/runs?${query}`],{encoding:'utf8'}));
  const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  return verifiedBase(result.workflow_runs,head,branch,sha=>{
    const result=spawnSync('git',['merge-base','--is-ancestor',sha,head]);
    if(result.error||![0,1].includes(result.status??-1))throw Error('祖先判断失败');
    return result.status===0;
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  const {values}=parseArgs({options:{base:{type:'string'},event:{type:'string'},'verify-docs':{type:'boolean'}}});
  let runtime=true;
  let base=values.base||'';
  try{
    if(values.event==='push'&&process.env.GITHUB_ACTIONS==='true'&&!values['verify-docs'])base=githubBase();
    const paths=changedPaths(base);runtime=runtimeRequired(values.event||'',paths);
    if(values['verify-docs']){
      if(runtime)throw Error('运行时改动须走完整验证');
      execFileSync('git',['diff','--check',base,'HEAD'],{stdio:'inherit'});
    }
  }catch(error){
    if(values['verify-docs'])throw error;
    console.error('比较基线未取得，执行完整验证：',String(error));
  }
  const result=`runtime=${runtime}\nbase=${base}\n`;
  if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,result);
  process.stdout.write(result);
}
