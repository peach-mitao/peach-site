import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, readFile, rm, mkdir, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {once} from 'node:events';
import {createPreviewServer, byteRange} from '../scripts/serve.ts';

test('字节范围支持首段、开放末段和超过文件长度的后缀', () => {
  for (const [range, expected] of [
    ['bytes=0-2', {start: 0, end: 2}], ['bytes=3-', {start: 3, end: 9}],
    ['bytes=-3', {start: 7, end: 9}], ['bytes=-100', {start: 0, end: 9}],
    ['bytes=0-100', {start: 0, end: 9}],
  ]) assert.deepEqual(byteRange(range, 10), expected);
  for (const range of ['bytes=-0', 'bytes=10-', 'bytes=8-3', 'bytes=-', 'bytes=0-1,3-4', 'bytes=9007199254740992-']) {
    assert.equal(byteRange(range, 10), null, range);
  }
  assert.equal(byteRange('bytes=0-', 0), null);
});

test('预览提供 HEAD、Range、错误隔离和同源文字编辑', async () => {
  const root = path.resolve(await mkdtemp(path.join(tmpdir(), 'peach-preview-')));
  const html = '<html><head></head><body>原文<script></script></body></html>';
  await writeFile(path.join(root, 'index.html'), html);
  await writeFile(path.join(root, 'video.mp4'), '0123456789');
  await mkdir(path.join(root, 'directory'));
  const server = await createPreviewServer({root});
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (file, options) => fetch(base + file, options);
    const home = await request('/');
    assert.equal(home.status, 200);
    assert.equal(await home.text(), html);
    const head = await request('/video.mp4', {method: 'HEAD'});
    assert.equal(head.headers.get('content-length'), '10');
    assert.equal(await head.text(), '');
    for (const [range, body] of [['bytes=1-3', '123'], ['bytes=-100', '0123456789'], ['bytes=7-', '789']]) {
      const response = await request('/video.mp4', {headers: {range}});
      assert.equal(response.status, 206);
      assert.equal(await response.text(), body);
    }
    assert.equal((await request('/video.mp4', {headers: {range: 'bytes=10-'}})).status, 416);
    assert.equal((await request('/missing')).status, 404);
    assert.equal((await request('/directory')).status, 404);
    assert.equal((await request('/%E0%A4%A')).status, 400);
    assert.equal((await request('/%00')).status, 400);
    assert.equal((await request('/%2e%2e%2fpackage.json')).status, 403);
    const edit = (body, origin = base) => request('/__edit/text', {method: 'POST', headers: {origin}, body: typeof body === 'string' ? body : JSON.stringify(body)});
    const forbidden=await edit({i: 0, raw: '原文', text: '新文'}, 'https://outside.example');
    assert.equal(forbidden.status,403);assert.match((await forbidden.json()).error,/本地预览/);
    const malformed=await edit('{');assert.equal(malformed.status,400);assert.match((await malformed.json()).error,/请求无效/);
    assert.equal((await edit({i: 0, raw: '原文', text: 5})).status, 400);
    assert.equal((await edit({i: 0, raw: '原文', text: '<新文>'})).status, 200);
    assert.ok((await readFile(path.join(root, 'index.html'), 'utf8')).includes('&lt;新文&gt;'));
    assert.equal((await edit({i: 0, raw: '原文', text: '过期内容'})).status, 409);
    const copy = (body, origin = base) => request('/__edit/copy', {method: 'POST', headers: {origin}, body: JSON.stringify(body)});
    assert.equal((await copy({key:'download.hint.docker',before:'',text:'容器部署'},'https://outside.example')).status,403);
    assert.equal((await copy({key:'download.hint.docker',before:'',text:'容器部署 "&<>'})).status,200);
    assert.equal((await copy({key:'download.hint.docker',before:'',text:'旧页面覆盖'})).status,409);
    assert.equal((await copy({key:'download.hint.docker',before:'容器部署 "&<>',text:'新提示'})).status,200);
    assert.equal((await copy({key:'__proto__',before:'',text:'拒绝'})).status,400);
    assert.equal((await edit({i:0,raw:'&lt;新文&gt;',text:'静态文本仍能改'})).status,200);
    // 文件保存失败也必须是有效 JSON，不能把空响应交给页面解析。
    await mkdir(path.join(root,'index.html.tmp'));
    const failure=await edit({i:0,raw:'静态文本仍能改',text:''});
    assert.equal(failure.status,500);assert.match((await failure.json()).error,/保存失败/);
    await rmdir(path.join(root,'index.html.tmp'));
    const deleted=await edit({i:0,raw:'静态文本仍能改',text:''});
    assert.equal(deleted.status,200);assert.equal((await deleted.json()).raw,'');
    assert.match(await (await request('/?edit')).text(), /window\.__EDIT=/);
    assert.equal((await request('/__edit.js')).status, 200);
    assert.equal((await request('/video.mp4', {method: 'DELETE'})).status, 405);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(root, {recursive: true, force: true});
  }
});

test('本地 Mac 下载清单只开放已登记的安装包', async () => {
  const root = path.resolve(await mkdtemp(path.join(tmpdir(), 'peach-download-preview-')));
  const filename = path.join(root, 'Peach-1.2.3-macos-arm64.dmg');
  await writeFile(filename, 'package');
  await writeFile(path.join(root, 'index.html'), '<html><head></head><body></body></html>');
  const manifest = path.join(root, 'downloads.json');
  await writeFile(manifest, JSON.stringify({version: '1.2.3', artifacts: [{path: filename, architecture: 'arm64'}, {path: 'ignored', architecture: 'other'}]}));
  const server = await createPreviewServer({root, downloadsManifest: manifest});
  try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const data = await (await fetch(base + '/__preview/downloads.json')).json();
    assert.equal(data.local, true);
    assert.equal(await (await fetch(base + data.files['macos-arm64'].href)).text(), 'package');
    assert.match(await (await fetch(base)).text(), /peach-local-downloads/);
    assert.deepEqual(Object.keys(data.files), ['macos-arm64']);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(root, {recursive: true, force: true});
  }
});
