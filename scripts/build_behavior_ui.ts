import {readFile,writeFile} from 'node:fs/promises';
import {supportRenderer} from './render_support_markup.ts';
import {supportDocument} from './support_document.ts';
export async function buildBehaviorUI(){
 const root=new URL('../worker/',import.meta.url),parts=['// 由 scripts/build_behavior_ui.ts 生成；文案源在 worker/ui/。'];
 const renderer=await supportRenderer();
 for(const [name,file] of [['dashboardHTML','dashboard'],['privacyHTML','privacy']]){
  const source=await readFile(new URL(`ui/${file}.html`,root),'utf8');
  const html=supportDocument(file as 'privacy'|'dashboard',source,renderer);
  parts.push(`export const ${name}=${JSON.stringify(html)};`);
 }
 await writeFile(new URL('behavior-ui.ts',root),parts.join('\n')+'\n');
}
