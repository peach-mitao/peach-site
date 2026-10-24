import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
const daily = ['/assets/films/*', '/assets/people/*', '/assets/vendor/*',
    '/assets/peach-logo.png', '/assets/peach-logo-192.webp', '/assets/peach-mark.svg',
    '/assets/peach-hello.svg', '/assets/mitao-hello.svg', '/favicon.ico'];
export function renderCacheHeaders(manifest: { files: any; }, pages: any[]) {
    const immutable = [...new Set(manifest.files.filter((item: { path: string; }) => item.path.startsWith('assets/screenshots/')
            && (/-20261014(?:-readme)?\.(?:png|webp)$/.test(item.path) || pages.some((page: string|any[]) => page.includes(item.path))))
            .map((item: { path: string; sha256: string; }) => {
            assert.match(item.path, /^assets\/screenshots\/[a-z0-9-]+-20\d{6}(?:-[a-z0-9]+)*\.(?:png|webp)$/);
            assert.match(item.sha256, /^[a-f0-9]{64}$/);
            return '/' + item.path;
        }))].sort();
    const rules = [...immutable.map(path => [path, 'public, max-age=31536000, immutable']),
        ['/assets/fonts/inter-latin-wght-normal.woff2', 'public, max-age=604800'],
        ...daily.map(path => [path, 'public, max-age=86400'])];
    assert.ok(rules.length <= 100, 'Cloudflare _headers 最多 100 条规则；应清退不再引用的截图规则');
    return '# 由 npm run cache:sync 生成；截图使用精确路径，避免 404 被长期缓存。\n'
        + rules.map(([path, value]) => `${path}\n  Cache-Control: ${value}\n`).join('\n');
}
export async function cacheHeaders({ check = false } = {}) {
    const root = new URL('../', import.meta.url);
    const manifest = JSON.parse(await readFile(new URL('assets-manifest.json', root), 'utf8'));
    const pages = await Promise.all(['site/index.html', 'site/en/index.html'].map(path => readFile(new URL(path, root), 'utf8')));
    const expected = renderCacheHeaders(manifest, pages);
    const target = new URL('site/_headers', root);
    if (check)
        assert.equal((await readFile(target, 'utf8')).replaceAll('\r\n', '\n'), expected, '请运行 npm run cache:sync 同步静态资源缓存规则');
    else
        await writeFile(target, expected);
    return expected;
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
    await cacheHeaders({ check: process.argv.includes('--check') });
