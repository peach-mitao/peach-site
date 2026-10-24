// 只同步独立页面使用的生产样式、字体与标志；来源以字节摘要锁定。
import {readFile,writeFile,mkdir,readdir,cp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
const source=process.argv[2];if(!source)throw Error('请指定 Peach 应用检出目录');
const root=fileURLToPath(new URL('../',import.meta.url)),target=path.join(root,'site/assets/support-ui');
await mkdir(target,{recursive:true});
const files:Record<string,string>={};
const copy=async(from:string,to:string)=>{const body=await readFile(path.join(source,from));await mkdir(path.dirname(path.join(target,to)),{recursive:true});await writeFile(path.join(target,to),body);files[to]=createHash('sha256').update(body).digest('hex')};
await copy('web/dist/peach-pages.css','peach-pages.css');
await copy('web/vendor/boardui-LICENSE.txt','boardui-LICENSE.txt');
await cp(path.join(source,'web/vendor/inter/5.3.0'),path.join(target,'inter'),{recursive:true});
async function record(relative:string){for(const entry of await readdir(path.join(target,relative),{withFileTypes:true})){const name=path.posix.join(relative,entry.name);if(entry.isDirectory())await record(name);else files[name]=createHash('sha256').update(await readFile(path.join(target,name))).digest('hex')}}
await record('inter');
const logo=await sharp(await readFile(path.join(source,'resources/peach-logo.png'))).resize({width:128,withoutEnlargement:true}).png().toBuffer();await writeFile(path.join(target,'logo.png'),logo);files['logo.png']=createHash('sha256').update(logo).digest('hex');
await writeFile(path.join(root,'support-ui-source.json'),JSON.stringify({repository:'https://github.com/peach-mitao/peach',commit:execFileSync('git',['rev-parse','HEAD'],{cwd:source,encoding:'utf8'}).trim(),files},null,2)+'\n');
console.log('已同步生产独立页样式、字体与标志，来源摘要已记录');
