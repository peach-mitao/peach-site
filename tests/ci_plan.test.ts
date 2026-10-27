import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {runtimeRequired,verifiedBase} from '../scripts/ci_plan.ts';

test('普通文档保留轻量检查，混合与未知输入执行完整验证',()=>{
  for(const name of ['README.md','README.zh-CN.md','docs/MAINTAINING.md','.github/PULL_REQUEST_TEMPLATE.md'])
    assert.equal(runtimeRequired('push',[name]),false);
  for(const names of [[],['README.md','worker/index.ts'],['docs/film-sources.json'],
    ['browser/vendor/ORIGIN.md'],['.github/workflows/check.yml'],['new-input']])
    assert.equal(runtimeRequired('push',names),true);
  assert.equal(runtimeRequired('workflow_dispatch',['README.md']),true);
});
test('push 基线只复用成功的同分支祖先，失败区间仍需验证',()=>{
  const head='a'.repeat(40),ancestor='b'.repeat(40),foreign='c'.repeat(40);
  const row=(sha:string,conclusion='success',event='push',head_branch='main')=>({head_sha:sha,conclusion,event,head_branch});
  const rows=[row(head),row(foreign),row(ancestor,'failure'),row(ancestor,'success','pull_request'),
    row(ancestor,'success','push','other'),row(ancestor)];
  assert.equal(verifiedBase(rows,head,'main',sha=>sha===ancestor),ancestor);
  assert.throws(()=>verifiedBase(rows.slice(0,-1),head,'main',sha=>sha===ancestor),/未取得/);
});
test('CLI 对真实 Git 差异选测，未知基线全量而文档入口拒绝代码',async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'peach-ci-plan-'));
  const git=(...args:string[])=>execFileSync('git',args,{cwd:directory,encoding:'utf8',stdio:['ignore','pipe','pipe']});
  const cli=(base:string,...args:string[])=>spawnSync(process.execPath,[fileURLToPath(new URL('../scripts/ci_plan.ts',import.meta.url)),
    '--base',base,'--event','push',...args],{cwd:directory,encoding:'utf8',env:{...process.env,GITHUB_ACTIONS:'false',GITHUB_OUTPUT:''}});
  try{
    git('init','-q');git('config','user.name','Fixture');git('config','user.email','fixture@example.invalid');
    await writeFile(path.join(directory,'README.md'),'# Fixture\n');git('add','README.md');git('commit','-qm','base');
    const base=git('rev-parse','HEAD').trim();
    await writeFile(path.join(directory,'README.md'),'# Updated\n');git('add','README.md');git('commit','-qm','docs');
    const docs=cli(base,'--verify-docs');assert.equal(docs.status,0,docs.stderr);assert.match(docs.stdout,/runtime=false/);
    await writeFile(path.join(directory,'runtime.ts'),'export const value=1;\n');git('add','runtime.ts');git('commit','-qm','runtime');
    assert.match(cli(base).stdout,/runtime=true/);assert.notEqual(cli(base,'--verify-docs').status,0);
    assert.match(cli('0'.repeat(40)).stdout,/runtime=true/);assert.notEqual(cli('0'.repeat(40),'--verify-docs').status,0);
  }finally{await rm(directory,{recursive:true,force:true})}
});
