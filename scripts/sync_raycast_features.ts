// 从锁定的原站资源提取完整模块，不重新编写样式参数。
import {createHash} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import {transform} from 'esbuild';
const sources=[
 {file:'4193wtgrb190o.css',sha256:'d1da0c359f53caf1d6595efbde971d5f191785e161e2e652eedb4e58e50d2336',from:'._3Yq4tG_container {',to:'.GhEOGG_container {'},
 {file:'2655y81y70_90.css',sha256:'b7fcce58e81d83d188e15f3fe61e74d6e8c607b2fe77d4a47b48b9becce8c14d',from:'.pFn2Lq_link {',to:'.WXKsXa_card {'},
 {file:'0m6-h7j26kp-g.css',sha256:'59b146eac5081b9c77f72a406ed9d6b256570e548dbd3ebc9787ab5d2aeffa08',from:'.utU0aa_showcaseReel {',to:'.utU0aa_dock {'},
 {file:'0m6-h7j26kp-g.css',sha256:'59b146eac5081b9c77f72a406ed9d6b256570e548dbd3ebc9787ab5d2aeffa08',from:'.utU0aa_dock {',to:'.utU0aa_menuBar {'},
 {file:'0m6-h7j26kp-g.css',sha256:'59b146eac5081b9c77f72a406ed9d6b256570e548dbd3ebc9787ab5d2aeffa08',from:'.utU0aa_tooltip {',to:'.Twvzhq_quickAiResponse {'},
];
let output='/* Raycast 公开页面模块；来源与 Peach 适配边界见 docs/reference-snapshots/raycast-home.md。 */\n';
for(const source of sources){
 const url='https://www.raycast.com/_next/static/immutable/chunks/'+source.file,response=await fetch(url,{signal:AbortSignal.timeout(20000)});
 if(!response.ok)throw Error('参考样式读取失败：'+response.status);
 const bytes=Buffer.from(await response.arrayBuffer());if(createHash('sha256').update(bytes).digest('hex')!==source.sha256)throw Error('参考资源版本发生变化：'+source.file);
 const css=(await transform(bytes.toString('utf8'),{loader:'css',minify:false})).code,start=css.indexOf(source.from),end=css.indexOf(source.to,start);
 if(start<0||end<=start)throw Error('参考模块边界未取得：'+source.file);
 output+=`/* ${url} SHA-256 ${source.sha256} */\n`+css.slice(start,end);
}
await writeFile(new URL('../site/assets/raycast-features.css',import.meta.url),output);
