import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const sources = JSON.parse(await readFile(path.join(root, 'docs/film-sources.json'), 'utf8'));
const manifestPath = path.join(root, 'assets-manifest.json');
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
const html = await readFile(path.join(root, 'site/index.html'), 'utf8');
const screenshots = new Set(html.match(/assets\/screenshots\/[\w-]+\.(?:png|webp)/g) || []);
const retired = /^assets\/(?:dark|shots|entities|marks|mock|stickers)\//;
const videos = new Set(['assets/intro-poster.jpg', 'assets/peach-intro-1080p.mp4', 'assets/sleeve.jpg']);
manifest.files = manifest.files.filter((item: { path: string }) => !retired.test(item.path) && !videos.has(item.path) && !/^assets\/(?:films|people)\//.test(item.path) && (!item.path.startsWith('assets/screenshots/') || screenshots.has(item.path) || item.path.endsWith('.png') && screenshots.has(item.path.replace(/\.png$/, '.webp'))));
await mkdir(path.join(root, 'site/assets/films'), { recursive: true });
const publicSources = Buffer.from(JSON.stringify(sources, null, 2) + '\n');
await writeFile(path.join(root, 'site/assets/films/sources.json'), publicSources);
for (const film of [...sources.films, ...(sources.people || []), ...(sources.organizations || [])]) {
    const bytes = await readFile(path.join(root, 'site', film.path));
    manifest.files.push({ path: film.path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), url: film.url });
}
manifest.files.push({ path: 'assets/films/sources.json', bytes: publicSources.length, sha256: createHash('sha256').update(publicSources).digest('hex') });
await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`电影素材 ${sources.films.length} 张、人物 ${(sources.people || []).length} 张，清单 ${manifest.files.length} 项；旧素材文件保留在本机，不进入发布目录。`);
