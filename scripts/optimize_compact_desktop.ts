import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import sharp, { type Sharp } from 'sharp';
import { writeImmutableImage } from './immutable_image.ts';
const captureDate = process.env.PEACH_CAPTURE_DATE || new Date().toISOString().slice(0, 10).replaceAll('-', '');
assert.match(captureDate, /^\d{8}$/);
// 4K 原图之外按显示尺寸缩小的候选宽度：桌面图最宽显示 1134 CSS 像素；
// 手机看的是 4:3 完整桌面图，最小一档约为常见手机设备像素的 1.4 倍，留出双指放大的余量。
export const VARIANT_WIDTHS = { wide: [1280, 1920, 2560], compact: [1440, 1920] };
const manifestUrl = new URL('../assets-manifest.json', import.meta.url);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8')), report: {name:string;variant:string;pngBytes:number;webpBytes:Record<number,number>;reencoded:boolean;identical:boolean}[] = [];
const file = (path: string) => fileURLToPath(new URL('../site/' + path, import.meta.url));
const raw = (input: Sharp) => input.ensureAlpha().raw().toBuffer();
// 已有文件与期望像素一致时保留原字节，不因编码器版本变化改动已发布的哈希。
async function writeLossless(path: string, pixels: Uint8Array, build: ()=>Sharp) {
    try {
        if ((await raw(sharp(file(path)))).equals(pixels))
            return false;
    }
    catch (error) {
        if (!['ENOENT', 'Input file is missing'].some(text => String((error as {code?:string}).code ?? (error instanceof Error ? error.message : String(error))).includes(text)))
            throw error;
    }
    await writeImmutableImage(file(path), await build().webp({ lossless: true, effort: 5 }).toBuffer());
    assert.ok((await raw(sharp(file(path)))).equals(pixels), path + ' 无损像素核对');
    return true;
}
async function register(path: string) {
    const bytes = await readFile(file(path));
    const entry = { path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    const index = manifest.files.findIndex((item: { path: any; }) => item.path === path);
    if (index >= 0)
        manifest.files[index] = entry;
    else
        manifest.files.push(entry);
    return bytes.length;
}
for (const variant of ['wide', 'compact'] as const) {
    for (const name of ['home', 'people', 'profile', 'play', 'follow', 'stats'].filter(name => !process.argv[2] || process.argv[2].split(',').includes(name))) {
        const stem = `assets/screenshots/${name}-${variant}-${captureDate}`;
        const png = file(stem + '.png');
        const meta = await sharp(png).metadata();
        assert.deepEqual([meta.width, meta.height], variant === 'wide' ? [3840, 2160] : [3840, 2880], name + ' 4K ' + variant);
        const encoded = await writeLossless(stem + '.webp', await raw(sharp(png)), () => sharp(png));
        const sizes: Record<number,number> = { 3840: await register(stem + '.webp') };
        for (const width of VARIANT_WIDTHS[variant]) {
            const resize = () => sharp(png).resize({ width, kernel: 'lanczos3' });
            await writeLossless(`${stem}-${width}.webp`, await raw(resize()), resize);
            sizes[width] = await register(`${stem}-${width}.webp`);
        }
        report.push({ name, variant, pngBytes: (await readFile(png)).length, webpBytes: sizes, reencoded: encoded, identical: true });
    }
}
await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
const reportUrl = new URL('../evidence/mobile/encoding.json', import.meta.url);
await mkdir(new URL('./', reportUrl), { recursive: true });
let previous = [];
try {
    previous = JSON.parse(await readFile(reportUrl, 'utf8'));
}
catch (error) {
    if ((error as {code?:string}).code !== 'ENOENT')
        throw error;
}
const retained = previous.filter((old: { name: any; variant: any; }) => !report.some(shot => old.name === shot.name && old.variant === shot.variant));
await writeFile(reportUrl, JSON.stringify([...retained, ...report], null, 2));
console.log(JSON.stringify(report));
