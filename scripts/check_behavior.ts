import {fileURLToPath} from 'node:url';
import {behaviorVersion} from './behavior_version.ts';
import {checkBehaviorArtifacts} from './behavior_artifacts.ts';
import {siteRoutes} from './capture_site_behavior.ts';
const directory=process.env.PEACH_BEHAVIOR_ARTIFACTS||fileURLToPath(new URL('../evidence/',import.meta.url));
const manifest=await checkBehaviorArtifacts(directory,'site',await behaviorVersion(),siteRoutes);
for(const page of ['/','/en/'])for(const viewport of ['desktop','mobile'])for(const state of ['platform.windows','platform.macos','platform.docker','mac-help'])if(!manifest.layouts.some(row=>row.page===page&&row.viewport===viewport&&row.state===state))throw Error(`缺少官网场景：${page} ${viewport} ${state}`);
console.log('官网追踪契约与参考图一致');
