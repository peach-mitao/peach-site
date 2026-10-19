import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=new URL('../',import.meta.url);
const sourcePath='frontend/src/copy-editor-core.js';
const repository='https://github.com/peach-mitao/peach';
const digest=body=>createHash('sha256').update(body).digest('hex');
async function targetPath(){
  const {name}=JSON.parse(await readFile(new URL('package.json',root),'utf8'));
  assert.ok(['peach-site','peach-demo'].includes(name));
  return name==='peach-site'?'copy-editor-core.js':'site/_demo/copy-editor-core.js';
}

export async function verifyCopyEditor(){
  const lock=JSON.parse(await readFile(new URL('copy-editor-source.json',root),'utf8'));
  assert.equal(lock.repository,repository);assert.equal(lock.path,sourcePath);
  assert.match(lock.commit,/^[a-f0-9]{40}$/);assert.equal(lock.target,await targetPath());
  assert.equal(digest(await readFile(new URL(lock.target,root))),lock.sha256,
    '共享编辑核心与锁定源不一致，请通过 edit:sync 同步，勿单独修改副本');
  return lock;
}

export async function syncCopyEditor(source,ref='HEAD'){
  const checkout=path.resolve(source);
  const commit=execFileSync('git',['-C',checkout,'rev-parse','--verify',`${ref}^{commit}`],{encoding:'utf8'}).trim();
  assert.match(commit,/^[a-f0-9]{40}$/);
  const body=execFileSync('git',['-C',checkout,'show',`${commit}:${sourcePath}`]);
  assert.ok(body.length>0);
  const target=await targetPath();await mkdir(path.dirname(fileURLToPath(new URL(target,root))),{recursive:true});
  await writeFile(new URL(target,root),body);
  const lock={repository,commit,path:sourcePath,target,sha256:digest(body)};
  await writeFile(new URL('copy-editor-source.json',root),JSON.stringify(lock,null,2)+'\n');
  await verifyCopyEditor();console.log(`共享编辑核心：${commit} / ${lock.sha256}`);
  return lock;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  if(process.argv[2]==='--check')await verifyCopyEditor();
  else {assert.ok(process.argv[2],'用法：npm run edit:sync -- <Peach 检出目录> [提交]');await syncCopyEditor(process.argv[2],process.argv[3])}
}
