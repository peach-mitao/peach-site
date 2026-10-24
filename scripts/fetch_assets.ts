import type { BinaryLike } from 'crypto';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(await readFile(new URL('../assets-manifest.json', import.meta.url), 'utf8'));
const digest = (body: BinaryLike|NonSharedBuffer) => createHash('sha256').update(body).digest('hex');
assert.ok(manifest.files.length <= 500);
for (const item of manifest.files) {
    assert.ok(/^assets\/[\w./-]+$/.test(item.path) && !item.path.split('/').includes('..'), item.path);
    const target = path.join(root, 'site', item.path);
    try {
        if (digest(await readFile(target)) === item.sha256)
            continue;
    }
    catch (error) {
        if ((error as {code?:string}).code !== 'ENOENT')
            throw error;
    }
    let body: Buffer;
    if (item.path === 'assets/films/sources.json') {
        const sources = JSON.parse(await readFile(new URL('../docs/film-sources.json', import.meta.url), 'utf8'));
        body = Buffer.from(JSON.stringify(sources, null, 2) + '\n');
    } else {
        const response = await fetch(new URL(item.url ?? item.path, manifest.origin), { signal: AbortSignal.timeout(30000) });
        assert.equal(response.status, 200, item.path);
        body = Buffer.from(await response.arrayBuffer());
    }
    assert.equal(body.length, item.bytes, item.path);
    assert.equal(digest(body), item.sha256, item.path);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target + '.download', body);
    await rename(target + '.download', target);
    console.log(item.path);
}
console.log(`校验 ${manifest.files.length} 个公开素材；源文件和页面文案保持不变。`);
