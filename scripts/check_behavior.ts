import {fileURLToPath} from 'node:url';
import {behaviorVersion} from './behavior_version.ts';
import {checkBehaviorArtifacts} from './behavior_artifacts.ts';
import {siteRoutes} from './capture_site_behavior.ts';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
export async function checkSiteBehavior(directory:string,version:string){
 const manifest=await checkBehaviorArtifacts(directory,'site',version,siteRoutes);
 for(const page of ['/','/en/'])for(const viewport of ['desktop','mobile'])for(const state of ['platform.windows','platform.macos','platform.docker','mac-help'])if(!manifest.layouts.some(row=>row.page===page&&row.viewport===viewport&&row.state===state))throw Error(`缺少官网场景：${page} ${viewport} ${state}`);
 return manifest;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const directory=process.env.PEACH_BEHAVIOR_ARTIFACTS||fileURLToPath(new URL('../evidence/',import.meta.url));
 await checkSiteBehavior(directory,await behaviorVersion());console.log('官网追踪契约与参考图一致');
}
