import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { writeImmutableImage } from '../scripts/immutable_image.ts';
import { renderCacheHeaders } from '../scripts/cache_headers.ts';
test('精确缓存已知截图，页面的新引用纳入规则，未知路径没有不可变缓存', () => {
    const paths = ['assets/screenshots/home-20261014.webp', 'assets/screenshots/home-wide-20990101.webp',
        'assets/screenshots/home-wide-20990102.webp'];
    const manifest = { files: paths.map(path => ({ path, sha256: 'a'.repeat(64) })) };
    const headers = renderCacheHeaders(manifest, [paths[1]]);
    const immutable = headers.trim().split(/\n\n/).filter(rule => rule.includes('immutable'));
    assert.equal(immutable.length, 2);
    assert.ok(immutable.some(rule => rule.includes('/' + paths[0] + '\n')));
    assert.ok(immutable.some(rule => rule.includes('/' + paths[1] + '\n')));
    assert.ok(immutable.every(rule => !rule.includes('*') && !rule.includes(paths[2])));
});
test('日期截图可创建，相同像素保留原字节，内容冲突保留已有图片', async () => {
    const directory = path.resolve(await mkdtemp(path.join(tmpdir(), 'peach-immutable-image-')));
    const file = path.join(directory, 'home-wide-20990101.png');
    const image = (color: string) => sharp({ create: { width: 4, height: 2, channels: 4, background: color } });
    try {
        const original = await image('#f09090').png({ compressionLevel: 0 }).toBuffer();
        assert.equal(await writeImmutableImage(file, original), true);
        const encoded = await image('#f09090').png({ compressionLevel: 9 }).toBuffer();
        assert.ok(!encoded.equals(original));
        assert.equal(await writeImmutableImage(file, encoded), false);
        assert.deepEqual(await readFile(file), original);
        const changed = await image('#008080').png().toBuffer();
        await assert.rejects(writeImmutableImage(file, changed), /PEACH_CAPTURE_DATE/);
        assert.deepEqual(await readFile(file), original);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
});
test('截图尺寸属于内容，不同形状不能复用相同文件名', async () => {
    const directory = path.resolve(await mkdtemp(path.join(tmpdir(), 'peach-immutable-shape-')));
    const file = path.join(directory, 'image.webp');
    const image = (width: number, height: number) => sharp({ create: { width, height, channels: 4, background: '#ffeedd' } }).webp({ lossless: true }).toBuffer();
    try {
        const original = await image(4, 2);
        await writeImmutableImage(file, original);
        await assert.rejects(writeImmutableImage(file, await image(2, 4)), /PEACH_CAPTURE_DATE/);
        assert.deepEqual(await readFile(file), original);
    }
    finally {
        await rm(directory, { recursive: true, force: true });
    }
});
