// 素材清单保持结构化；页面说明通过既有编辑器写回模板。
import path from 'node:path';
import {readFile} from 'node:fs/promises';
import {buildCredits,renderCredits} from './build_credits.ts';
import {EditConflict} from './edit-history.ts';
import type {SourceView} from './edit-server.ts';
export async function context(site:string,pathname:string):Promise<{file:string;view:SourceView}|null>{
 if(!['/credits/','/credits/index.html'].includes(pathname))return null;
 const projectRoot=path.dirname(site),file=path.join(projectRoot,'templates/credits.html');
 const sources=JSON.parse(await readFile(path.join(projectRoot,'docs/film-sources.json'),'utf8'));
 const marker=/<!--credits:start-->[\s\S]*?<!--credits:end-->/;
 const generated=renderCredits(sources,'<!--credits-->');
 return {file,view:{render:source=>renderCredits(sources,source),extract:html=>{
  if(html.match(marker)?.[0]!==generated)throw new EditConflict('素材署名与许可由来源清单维护，请修改 docs/film-sources.json');
  return html.replace(marker,'<!--credits-->');
 },saved:async()=>{await buildCredits({projectRoot})}}};
}
