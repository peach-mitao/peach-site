import assert from 'node:assert/strict';
// 对 cf dev 或公开站点检查真实响应；编辑预览服务不应用 Cloudflare _headers。
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:8795/');
const checks = [
    ['/assets/screenshots/home-20261014.webp', 31536000, true],
    ['/assets/screenshots/home-wide-20261018.webp', 31536000, true],
    ['/assets/fonts/inter-latin-wght-normal.woff2', 604800, false],
    ['/assets/entities/performer-remu.webp', 86400, false],
    ['/assets/stickers/remu.png', 86400, false],
    ['/assets/peach-logo.png', 86400, false],
 ] as const;
for (const [path, age, immutable] of checks) {
    const url = new URL(path, base);
    const response = await fetch(url, { method: 'HEAD' });
    assert.equal(response.status, 200, path);
    const control = response.headers.get('cache-control') ?? '';
    assert.match(control, new RegExp(`(?:^|,\\s*)max-age=${age}(?:,|$)`), path);
    assert.equal(control.includes('immutable'), immutable, path);
    assert.equal((control.match(/max-age=/g) ?? []).length, 1, path + ' 缓存规则唯一');
    const etag = response.headers.get('etag');
    assert.ok(etag, path + ' ETag');
    const conditional = await fetch(url, { method: 'HEAD', headers: { 'If-None-Match': etag } });
    assert.equal(conditional.status, 304, path + ' 条件请求');
    console.log(`PASS ${path}: ${control}; ETag → 304`);
}
for (const path of ['/', '/en/', '/assets/downloads.js', '/assets/media-01.css'] as const) {
    const response = await fetch(new URL(path, base), { method: 'HEAD' });
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('cache-control') ?? '', /max-age=0/);
    assert.ok(!(response.headers.get('cache-control') ?? '').includes('immutable'), path);
}
assert.equal((await fetch(new URL('/_headers', base), { method: 'HEAD' })).status, 404);
const missing = await fetch(new URL('/assets/screenshots/__missing__-20990101.webp', base), { method: 'HEAD' });
assert.equal(missing.status, 404);
assert.ok(!(missing.headers.get('cache-control') ?? '').includes('immutable'), '不存在的截图不能长期缓存');
console.log('PASS 页面与可更新脚本保持校验，配置文件不公开');
