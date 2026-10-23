import {createHash} from 'node:crypto';
import {readdir,readFile,writeFile} from 'node:fs/promises';
export async function behaviorVersion(){
 const root=new URL('../',import.meta.url),hash=createHash('sha256');
 async function add(directory:string,accept:(name:string)=>boolean){for(const entry of (await readdir(new URL(directory,root),{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const name=directory+entry.name;if(entry.isDirectory())await add(name+'/',accept);else if(accept(name))hash.update(name+'\0').update((await readFile(new URL(name,root),'utf8')).replaceAll('\r\n','\n'))}}
  await add('browser/',name=>name.endsWith('.ts')&&!name.endsWith('behavior-version.ts')&&!name.endsWith('behavior-dashboard.ts')&&!name.endsWith('behavior-controls.ts')&&!name.endsWith('behavior-privacy.ts'));
 for(const name of ['site/index.html','site/en/index.html','site/copyright/index.html','site/en/copyright/index.html','site/assets/media-01.css','assets-manifest.json'])hash.update(name+'\0').update((await readFile(new URL(name,root),'utf8')).replaceAll('\r\n','\n'));
 const version=hash.digest('hex');await writeFile(new URL('browser/assets/behavior-version.ts',root),`// 构建生成的布局指纹。\nexport const layoutVersion='${version}';\n`);return version;
}
