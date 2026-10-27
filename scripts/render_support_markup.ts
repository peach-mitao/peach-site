import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
import type {SelectState} from '../browser/assets/behavior-select-state.ts';

export async function supportRenderer(){
 const root=fileURLToPath(new URL('../',import.meta.url)),outfile=path.join(root,'build/support-renderer.mjs');
 await mkdir(path.dirname(outfile),{recursive:true});
 const banner={js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"};
 await build({stdin:{contents:"import {renderToStaticMarkup} from 'react-dom/server';import {privacyView} from './browser/assets/privacy-view.ts';import {selectView,headerButtonClass} from './browser/assets/behavior-select-view.ts';export {headerButtonClass};export const renderPrivacy=(off,english)=>renderToStaticMarkup(privacyView({off,english}));export const renderSelect=state=>renderToStaticMarkup(selectView(state));",resolveDir:root,sourcefile:'support-renderer.ts'},outfile,banner,bundle:true,platform:'node',format:'esm',jsx:'automatic',external:['react','react-dom'],alias:{'@/utils/cx':path.join(root,'browser/vendor/boardui/utils/cx.ts')},define:{'process.env.NODE_ENV':'"production"'}});
 return await import(pathToFileURL(outfile).href) as {renderPrivacy:(off:boolean,english:boolean)=>string;renderSelect:(state:SelectState)=>string;headerButtonClass:string};
}
