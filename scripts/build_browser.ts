import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {transform,build} from 'esbuild';
import {buildBehaviorUI} from './build_behavior_ui.ts';
import {behaviorVersion} from './behavior_version.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildBrowser(){
  await buildBehaviorUI();
  await behaviorVersion();
  async function walk(relative=''){
    for(const entry of await readdir(path.join(root,'browser',relative),{withFileTypes:true})){
      const name=path.join(relative,entry.name);
      if(entry.isDirectory()){await walk(name);continue}
      if(!name.endsWith('.ts')||name.endsWith('.d.ts')||entry.name==='behavior-controls.ts')continue;
      const file=path.join(root,'browser',name),out=path.join(root,name==='edit-client.ts'?'edit-client.js':path.join('site',name.replace(/\.ts$/,'.js')));
      if(entry.name==='behavior-dashboard.ts'){
        await build({entryPoints:[file],outfile:out,bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
        continue;
      }
      if(['locale.ts','page-support.ts'].includes(entry.name)){
        await build({entryPoints:[file],outfile:out,bundle:true,format:'iife',platform:'browser',target:'es2022',charset:'utf8'});continue;
      }
      const result=await transform(await readFile(file,'utf8'),{loader:'ts',target:'es2022',charset:'utf8',sourcefile:file});
      const code=result.code.replace(/(from\s+["'][^"']+)\.ts(["'])/g,'$1.js$2').replace(/(import\(\s*["'][^"']+)\.ts(["']\s*\))/g,'$1.js$2');
      await mkdir(path.dirname(out),{recursive:true});await writeFile(out,code);
    }
  }
  await walk();
  await writeFile(path.join(root,'site/assets/behavior-kumo.css'),await readFile(path.join(root,'node_modules/@cloudflare/kumo/dist/styles/kumo-standalone.css')));
  const licenses=path.join(root,'site/assets/vendor/behavior');await mkdir(licenses,{recursive:true});
  for(const [name,pkg] of [['kumo','@cloudflare/kumo'],['react','react'],['react-dom','react-dom'],['phosphor','@phosphor-icons/react']])await writeFile(path.join(licenses,name+'-LICENSE'),await readFile(path.join(root,'node_modules',pkg,'LICENSE')));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildBrowser();
