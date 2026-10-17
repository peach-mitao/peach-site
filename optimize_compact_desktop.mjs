import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const manifestUrl=new URL('./assets-manifest.json',import.meta.url);
const manifest=JSON.parse(await readFile(manifestUrl,'utf8')),report=[];
for(const variant of ['wide','compact']) {
for(const name of ['home','people','profile','play','follow','stats'].filter(name=>!process.argv[2]||process.argv[2].split(',').includes(name))) {
  const png=new URL(`./site/assets/screenshots/${name}-${variant}-20261018.png`,import.meta.url);
  const path=`assets/screenshots/${name}-${variant}-20261018.webp`;
  const target=new URL('./site/'+path,import.meta.url);
  const meta=await sharp(fileURLToPath(png)).metadata();
  assert.deepEqual([meta.width,meta.height],variant==='wide'?[3840,2160]:[3840,2880],name+' 4K '+variant);
  await sharp(fileURLToPath(png)).webp({lossless:true,effort:5}).toFile(fileURLToPath(target));
  const original=await sharp(fileURLToPath(png)).ensureAlpha().raw().toBuffer();
  const encoded=await sharp(fileURLToPath(target)).ensureAlpha().raw().toBuffer();
  assert.ok(original.equals(encoded),name+' 无损像素核对');
  const bytes=await readFile(target);
  const entry={path,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
  const index=manifest.files.findIndex(file=>file.path===path);
  if(index>=0)manifest.files[index]=entry;else manifest.files.push(entry);
  report.push({name,variant,pngBytes:(await readFile(png)).length,webpBytes:bytes.length,identical:true});
}
}
await writeFile(manifestUrl,JSON.stringify(manifest,null,2)+'\n');
const reportUrl=new URL('./evidence/mobile/encoding.json',import.meta.url);
let previous=[];
try{previous=JSON.parse(await readFile(reportUrl,'utf8'))}catch(error){if(error.code!=='ENOENT')throw error}
const retained=previous.filter(old=>!report.some(shot=>old.name===shot.name&&old.variant===shot.variant));
await writeFile(reportUrl,JSON.stringify([...retained,...report],null,2));
console.log(JSON.stringify(report));
