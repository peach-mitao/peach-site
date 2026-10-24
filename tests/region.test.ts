import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.ts';
import {regionResponse} from '../worker/region.ts';

function request(path: string, country?: string, method = 'GET', headers: Record<string,string> = {}) {
  return Object.assign(new Request('https://peach.video' + path, {method, headers}), {cf: {country}});
}
const deniedAssets = {fetch() {throw Error('受限请求不得读取资源');}};

test('CN 的页面、接口、快照、图片和视频跳转到同源提示页', async () => {
  for (const path of ['/', '/en/', '/api/event', '/api/items', '/_demo/data/snapshot.json', '/assets/cover.jpg', '/stream?id=1', '/analytics', '/%75navailable?next=https://outside.example']) {
    const response = await regionResponse(request(path, 'CN'), deniedAssets);
    assert.equal(response?.status, 302, path);
    assert.equal(response?.headers.get('location'), 'https://peach.video/unavailable');
    assert.equal(response?.headers.get('cache-control'), 'private, no-store');
  }
  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const response = await regionResponse(request('/api/items', 'CN', method), deniedAssets);
    assert.equal(response?.status, 303);
  }
  assert.equal((await regionResponse(request('/', 'CN', 'HEAD'), deniedAssets))?.status, 302);
});

test('港澳台、其他地区和未知地区正常放行，客户端地区请求头不参与判断', async () => {
  for (const country of ['HK', 'MO', 'TW', 'JP', 'US', 'XX', undefined]) {
    assert.equal(await regionResponse(request('/', country, 'GET', {'cf-ipcountry': 'CN'}), deniedAssets), null);
  }
  assert.equal((await regionResponse(request('/', 'CN', 'GET', {'cf-ipcountry': 'HK', 'x-forwarded-for': '8.8.8.8'}), deniedAssets))?.status, 302);
});

test('提示页返回 403、禁止缓存且 HEAD 无正文，不重复跳转', async () => {
  for (const path of ['/unavailable', '/unavailable/', '/unavailable.html?next=/']) {
    for (const country of ['CN', 'HK']) {
      let reads = 0;
      const assets = {fetch(input: Request) {reads++; assert.equal(new URL(input.url).pathname, '/unavailable.html'); return new Response('<h1>不提供服务</h1>');}};
      const response = await regionResponse(request(path, country), assets);
      assert.equal(response?.status, 403);
      assert.match(await response!.text(), /不提供服务/);
      assert.equal(response?.headers.get('location'), null);
      assert.equal(response?.headers.get('cache-control'), 'private, no-store');
      assert.equal(reads, 1);
      const head = await regionResponse(request(path, country, 'HEAD'), assets);
      assert.equal(head?.status, 403);
      assert.equal(await head!.text(), '');
    }
  }
  const missing = await regionResponse(request('/unavailable', 'CN'), {fetch: () => new Response('missing', {status: 404})});
  assert.equal(missing?.status, 403);
  assert.equal(await missing!.text(), '不提供服务');
});

test('CN 可读取提示页样式、字体和标识，其他支持页脚本仍受限制', async () => {
  for (const path of ['/assets/support-ui/inter/index.css', '/assets/support-ui/peach-pages.css', '/assets/support-ui/support.css', '/assets/support.css', '/assets/support-ui/logo.png', '/assets/support-ui/inter/files/inter-latin-wght-normal.woff2']) {
    assert.equal(await regionResponse(request(path, 'CN'), deniedAssets), null, path);
  }
  for (const path of ['/assets/support-ui/page-support.js', '/assets/support-ui/private.json', '/assets/support-ui/inter/files/data.json']) {
    assert.equal((await regionResponse(request(path, 'CN'), deniedAssets))?.status, 302);
  }
});

test('Worker 在接口处理与资源读取前执行 CN 限制', async () => {
  const response = await worker.fetch(request('/api/items', 'CN'), {ASSETS: deniedAssets, SITE_EVENTS: {writeDataPoint() {throw Error('受限请求不得写入事件');}}});
  assert.equal(response.status, 302);
});
