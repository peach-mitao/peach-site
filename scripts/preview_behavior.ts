import {createPreviewServer} from './serve.ts';
import {behaviorStorage} from './behavior_storage.ts';
import {behaviorRequest} from '../worker/behavior.ts';
import {buildBrowser} from './build_browser.ts';
import {buildBehaviorUI} from './build_behavior_ui.ts';
import {supportRenderer} from './render_support_markup.ts';
import {supportDocument,supportSource} from './support_document.ts';
import * as edit from './edit-server.ts';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),port=Number(process.argv[2]||8797);
if(!Number.isInteger(port)||port<1024||port>65535)throw Error('预览端口无效');
await buildBrowser();
const {database}=behaviorStorage(process.argv.includes('--empty')?':memory:':fileURLToPath(new URL('evidence/behavior-preview.sqlite',root)));
const renderer=await supportRenderer();
const view=(pathname:string):edit.SourceView=>{
 const kind=pathname.startsWith('/analytics')?'dashboard':'privacy';
 return {render:source=>supportDocument(kind,source,renderer),extract:html=>supportSource(kind,html,renderer),saved:buildBehaviorUI};
};
const editable=(path:string)=>fileURLToPath(new URL(path.startsWith('/analytics')?'worker/ui/dashboard.html':path.startsWith('/privacy/analytics')?'worker/ui/privacy.html':'site/index.html',root));
const server=await createPreviewServer({publicReleases:true,editIndex:req=>{try{const path=new URL(req.headers.referer||'http://127.0.0.1').pathname;return path.startsWith('/analytics')||path.startsWith('/privacy/analytics')?editable(path):undefined}catch{return undefined}},editView:req=>{const path=new URL(req.headers.referer||'http://127.0.0.1').pathname;return path.startsWith('/analytics')||path.startsWith('/privacy/analytics')?view(path):undefined},async dynamic(req,res){
 const url=new URL(req.url||'/',`http://127.0.0.1:${port}`);
 if(!['/api/behavior','/privacy/analytics'].includes(url.pathname)&&!url.pathname.startsWith('/analytics'))return false;
 if(req.method==='GET'&&(url.pathname==='/privacy/analytics'||/^\/analytics\/?$/.test(url.pathname))){
  const source=editable(url.pathname),projection=view(url.pathname),html=url.searchParams.has('edit')?await edit.page(source,port,projection):projection.render(await readFile(source,'utf8'));
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}).end(html);return true;
 }
 const chunks:Buffer[]=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>49152){res.writeHead(413).end();return true}chunks.push(chunk)}
 const request=new Request(url,{method:req.method,headers:new Headers(Object.entries(req.headers).filter((row):row is [string,string]=>typeof row[1]==='string')),body:chunks.length?Buffer.concat(chunks):undefined});
 const response=await behaviorRequest(request,{BEHAVIOR:database,BEHAVIOR_PREVIEW:'1',CF_DASHBOARD_URL:process.env.PEACH_CF_DASHBOARD_URL,BEHAVIOR_LAYOUTS:{async get(key){if(!/^layouts\/[a-f0-9/.-]+\.webp$/.test(key))return null;try{return {body:new Blob([await readFile(new URL('evidence/'+key,root))]).stream()}}catch{return null}},async delete(){throw Error('预览不清理参考截图')}}});
 if(!response)return false;res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return true;
}});
server.listen(port,'127.0.0.1',()=>console.log(`行为分析预览 http://127.0.0.1:${port}/analytics/?edit`));
server.on('error',error=>{console.error(error);process.exitCode=1});
