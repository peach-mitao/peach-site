import {readFile,writeFile} from 'node:fs/promises';
export async function buildBehaviorUI(){
 const root=new URL('../worker/',import.meta.url),parts=['// 由 scripts/build_behavior_ui.ts 生成；文案源在 worker/ui/。'];
 for(const [name,file] of [['dashboardHTML','dashboard'],['privacyHTML','privacy']])parts.push(`export const ${name}=${JSON.stringify(await readFile(new URL(`ui/${file}.html`,root),'utf8'))};`);
 await writeFile(new URL('behavior-ui.ts',root),parts.join('\n')+'\n');
}
