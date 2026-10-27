import {readdir,readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import {transform,build} from 'esbuild';
import {createHash} from 'node:crypto';
import {buildBehaviorUI} from './build_behavior_ui.ts';
import {behaviorVersion} from './behavior_version.ts';
import {buildBoardUIStyles} from './build_boardui_styles.ts';
import {buildCredits} from './build_credits.ts';
import {buildLocale} from './build_i18n.ts';

const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildBrowser(){
  await buildBoardUIStyles();
  await buildBehaviorUI();
  async function walk(relative=''){
    for(const entry of await readdir(path.join(root,'browser',relative),{withFileTypes:true})){
      const name=path.join(relative,entry.name);
      if(entry.isDirectory()){await walk(name);continue}
      if(!name.endsWith('.ts')||name.endsWith('.d.ts')||entry.name==='behavior-controls.ts')continue;
      const file=path.join(root,'browser',name),out=path.join(root,name==='edit-client.ts'?'edit-client.js':path.join('site',name.replace(/\.ts$/,'.js')));
      if(entry.name==='behavior-privacy.ts'){
        await build({entryPoints:[file],outfile:out,bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',minify:true,external:['./boardui.js','./site-language.js','./copy.js'],define:{'process.env.NODE_ENV':'"production"'}});continue;
      }
      if(['boardui.ts','edit-toolbar.ts'].includes(entry.name)){
        const result=await build({entryPoints:[file],outfile:out,bundle:true,format:entry.name==='edit-toolbar.ts'?'iife':'esm',platform:'browser',target:'es2022',charset:'utf8',minify:true,jsx:'automatic',alias:{'@/utils/cx':path.join(root,'browser/vendor/boardui/utils/cx.ts')},loader:{'.css':'text'},define:{'process.env.NODE_ENV':'"production"'},metafile:true});
        if(entry.name==='edit-toolbar.ts'){
          const digest=(body:Uint8Array)=>createHash('sha256').update(body).digest('hex'),sources:Record<string,string>={};
          for(const input of Object.keys(result.metafile.inputs).sort())sources[input]=digest(await readFile(path.resolve(root,input)));
          await writeFile(path.join(root,'editor-ui-build.json'),JSON.stringify({sha256:digest(await readFile(out)),sources},null,2)+'\n');
        }
        continue;
      }
      if(entry.name==='behavior-dashboard.ts'){
        await build({entryPoints:[file],outfile:out,bundle:true,format:'esm',platform:'browser',target:'es2022',charset:'utf8',minify:true,define:{'process.env.NODE_ENV':'"production"'}});
        continue;
      }
      if(['locale.ts','page-support.ts','privacy-bootstrap.ts'].includes(entry.name)){
        await build({entryPoints:[file],outfile:out,bundle:true,format:'iife',platform:'browser',target:'es2022',charset:'utf8'});continue;
      }
      const result=await transform(await readFile(file,'utf8'),{loader:'ts',target:'es2022',charset:'utf8',sourcefile:file});
      const code=result.code.replace(/(from\s+["'][^"']+)\.ts(["'])/g,'$1.js$2').replace(/(import\(\s*["'][^"']+)\.ts(["']\s*\))/g,'$1.js$2');
      await mkdir(path.dirname(out),{recursive:true});await writeFile(out,code);
    }
  }
  await walk();
  await buildCredits();
  const locale=await buildLocale('en',{write:true});
  if(locale.missing.size||locale.runtimeMissing.size||locale.stale.length)throw Error('英文尚未同步：'+[...locale.missing,...locale.runtimeMissing,...locale.stale].join('；'));
  await behaviorVersion();
  const version=await transform(await readFile(path.join(root,'browser/assets/behavior-version.ts'),'utf8'),{loader:'ts',target:'es2022'});
  await writeFile(path.join(root,'site/assets/behavior-version.js'),version.code);
  await writeFile(path.join(root,'site/assets/behavior-kumo.css'),await readFile(path.join(root,'node_modules/@cloudflare/kumo/dist/styles/kumo-standalone.css')));
  const licenses=path.join(root,'site/assets/vendor/behavior');await mkdir(licenses,{recursive:true});
  for(const [name,pkg] of [['kumo','@cloudflare/kumo'],['react','react'],['react-dom','react-dom'],['phosphor','@phosphor-icons/react'],['canvas-confetti','canvas-confetti']])await writeFile(path.join(licenses,name+'-LICENSE'),await readFile(path.join(root,'node_modules',pkg,'LICENSE')));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildBrowser();
