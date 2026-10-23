import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {transform} from 'esbuild';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildBrowser(){
  async function walk(relative=''){
    for(const entry of await readdir(path.join(root,'browser',relative),{withFileTypes:true})){
      const name=path.join(relative,entry.name);
      if(entry.isDirectory()){await walk(name);continue}
      if(!name.endsWith('.ts')||name.endsWith('.d.ts'))continue;
      const file=path.join(root,'browser',name),out=path.join(root,name==='edit-client.ts'?'edit-client.js':path.join('site',name.replace(/\.ts$/,'.js')));
      const result=await transform(await readFile(file,'utf8'),{loader:'ts',target:'es2022',charset:'utf8',sourcefile:file});
      const code=result.code.replace(/(from\s+["'][^"']+)\.ts(["'])/g,'$1.js$2').replace(/(import\(\s*["'][^"']+)\.ts(["']\s*\))/g,'$1.js$2');
      await mkdir(path.dirname(out),{recursive:true});await writeFile(out,code);
    }
  }
  await walk();
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildBrowser();
