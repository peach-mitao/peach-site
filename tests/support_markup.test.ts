import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {supportRenderer} from '../scripts/render_support_markup.ts';
import {supportDocument,supportSource} from '../scripts/support_document.ts';
import {bounds,textSlices,editHtml} from '../scripts/edit-server.ts';

const renderer=await supportRenderer();
for(const kind of ['privacy','dashboard'] as const){
 test(`${kind} 预渲染可还原维护源并保留文案编辑`,async()=>{
  const source=await readFile(new URL(`../worker/ui/${kind}.html`,import.meta.url),'utf8');
  const plain=source.replaceAll('\r\n','\n');
  for(const input of [plain,plain.replaceAll('\n','\r\n')]){
   assert.equal(supportSource(kind,supportDocument(kind,input,renderer),renderer),input);
   const title=kind==='privacy'?'统计偏好':'点击与动线',changed=input.replace(title,'预览文案');
   assert.equal(supportSource(kind,supportDocument(kind,changed,renderer),renderer),changed);
  }
 });
}
test('统计偏好结构删除后拒绝生成不可恢复的维护源',()=>{
 assert.throws(()=>supportSource('privacy','<p>内容已删除</p>',renderer),/主体结构已改变/);
});
test('编辑文字索引跳过惰性模板并保留模板内容',()=>{
 const source='<body>前文<template><p>模板文字</p></template>后文</body>',{from,to}=bounds(source);
 assert.deepEqual(textSlices(source,from,to).map(([start,end])=>source.slice(start,end)),['前文','后文']);
 const changed=editHtml(source,'text',{i:1,raw:'后文',text:'修改后文'});
 assert.equal(changed.status,200);
 assert.equal(changed.html,'<body>前文<template><p>模板文字</p></template>修改后文</body>');
});
