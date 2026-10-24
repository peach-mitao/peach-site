import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildBoardUIStyles(){
 const output=path.join(root,'site/assets/boardui.css');
 execFileSync(process.execPath,[path.join(root,'node_modules/@tailwindcss/cli/dist/index.mjs'),'-i',path.join(root,'browser/boardui.css'),'-o',output,'--minify'],{cwd:root,stdio:'inherit'});
 const css=await readFile(output,'utf8');
 // 同一组真实语义token可用于普通页面和隔离的编辑工具。
 await writeFile(output,css.replaceAll(':root{',':root,:host{').replaceAll('.dark{','.dark,:host(.dark){').replaceAll('.dark[data-accent]{','.dark[data-accent],:host(.dark[data-accent]){'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await buildBoardUIStyles();
