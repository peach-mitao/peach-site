import {fileURLToPath} from 'node:url';
import {captureBehavior,registerPreview,type CaptureScene} from './capture_behavior.ts';
export const siteRoutes=['/','/en/','/copyright/','/en/copyright/'];
export const siteScenes:(string|CaptureScene)[]=[...siteRoutes,...['/','/en/'].flatMap(route=>[
 {route,click:['[data-platform-option="macos"]']},
 {route,click:['[data-platform-option="docker"]']},
 {route,click:['[data-platform-option="macos"]','[data-mac-help]']},
])];
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const base=process.argv[2];if(!base)throw Error('请提供本地官网预览地址');
 const directory=fileURLToPath(new URL('../evidence/',import.meta.url));
 await registerPreview(await captureBehavior(base,siteScenes,directory),directory);
}
