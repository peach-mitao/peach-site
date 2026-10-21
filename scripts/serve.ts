// 本地预览与文字编辑；服务仅绑定回环地址，不随 site/ 发布。
import http from 'node:http';
import path from 'node:path';
import {createReadStream} from 'node:fs';
import {stat, readFile} from 'node:fs/promises';
import {fileURLToPath, pathToFileURL} from 'node:url';
import * as edit from './edit-server.ts';

const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.ico': 'image/x-icon',
};

export function byteRange(value: string, size: number): {start: number; end: number} | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value);
  if (!match || (!match[1] && !match[2]) || size === 0) return null;
  const first = Number(match[1]), last = Number(match[2]);
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last)) return null;
  const start = match[1] ? first : Math.max(0, size - last);
  const end = match[1] && match[2] ? Math.min(last, size - 1) : size - 1;
  return start >= 0 && start <= end && start < size ? {start, end} : null;
}

interface PreviewOptions {
  root?: string;
  downloadsManifest?: string;
}

export async function createPreviewServer(options: PreviewOptions = {}) {
  const root = path.resolve(options.root ?? fileURLToPath(new URL('../site/', import.meta.url)));
  const index = path.join(root, 'index.html');
  const previewFiles = new Map<string, string>();
  let previewDownloads: {version: string; local: true; files: Record<string, {name: string; href: string}>} | undefined;
  if (options.downloadsManifest) {
    const manifest: {version: string; artifacts: {path: string; architecture: string}[]} = JSON.parse(await readFile(options.downloadsManifest, 'utf8'));
    previewDownloads = {version: manifest.version, local: true, files: {}};
    for (const artifact of manifest.artifacts) {
      const name = path.basename(artifact.path);
      if (!['arm64', 'x86_64'].includes(artifact.architecture) || !/^Peach-[\w.+-]+-macos-(arm64|x86_64)\.dmg$/.test(name)) continue;
      await stat(artifact.path);
      const href = `/__preview/packages/${name}`;
      previewFiles.set(href, artifact.path);
      previewDownloads.files[`macos-${artifact.architecture}`] = {name, href};
    }
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let name: string;
      try {name = decodeURIComponent(url.pathname)} catch {res.writeHead(400).end(); return}
      if (name.includes('\0') || name.includes('\\')) {res.writeHead(400).end(); return}
      if (req.method === 'POST' && ['/__edit/tab', '/__edit/text', '/__edit/copy', '/__edit/block'].includes(name)) {
        const rejectEdit = (status: number, error: string) => res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}).end(JSON.stringify({error}));
        const address = server.address();
        const port = address && typeof address !== 'string' ? address.port : 0;
        if (![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin ?? '')) {rejectEdit(403, '请从当前本地预览页保存，刷新后重试'); return}
        const chunks: Buffer[] = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 65536) {rejectEdit(413, '本次文案过长，请分段编辑'); return}
          chunks.push(chunk);
        }
        let input: unknown;
        try {input = JSON.parse(Buffer.concat(chunks).toString('utf8'))} catch {rejectEdit(400, '编辑请求无效，请刷新后重试'); return}
        const result = await edit.post(index, name.endsWith('/tab') ? 'tab' : name.endsWith('/copy') ? 'copy' : name.endsWith('/block') ? 'block' : 'text', input);
        res.writeHead(result.status, {'Content-Type': 'application/json; charset=utf-8'}).end(JSON.stringify(result.json));
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method ?? '')) {res.writeHead(405, {Allow: 'GET, HEAD'}).end(); return}
      const reply = (body: string, type: string) => {
        res.writeHead(200, {'Content-Type': type, 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store'}).end(req.method === 'HEAD' ? undefined : body);
      };
      if (previewDownloads && name === '/__preview/downloads.json') {reply(JSON.stringify(previewDownloads), 'application/json'); return}
      if (name === '/__edit.js') {reply(await readFile(edit.client, 'utf8'), types['.js']); return}
      if (name === '/__edit-core.js') {reply(await readFile(edit.core, 'utf8'), types['.js']); return}
      if (name === '/' || name === '/index.html') {
        if (url.searchParams.has('edit')) {
          const address = server.address();
          reply(await edit.page(index, address && typeof address !== 'string' ? address.port : 0), types['.html']); return;
        }
        if (previewDownloads) {
          reply((await readFile(index, 'utf8')).replace('<head>', '<head>\n<meta name="peach-local-downloads" content="/__preview/downloads.json">'), types['.html']); return;
        }
      }
      const file = previewFiles.get(name) ?? path.resolve(root, '.' + (name.endsWith('/') ? name + 'index.html' : name));
      const relative = path.relative(root, file);
      if (!previewFiles.has(name) && (relative.startsWith('..') || path.isAbsolute(relative))) {res.writeHead(403).end(); return}
      let info;
      try {info = await stat(file)} catch {res.writeHead(404).end('Not found'); return}
      if (!info.isFile()) {res.writeHead(404).end('Not found'); return}
      const headers = {'Content-Type': types[path.extname(file)] ?? 'application/octet-stream', 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store'};
      let range: {start: number; end: number} | undefined;
      if (req.headers.range) {
        range = byteRange(req.headers.range, info.size) ?? undefined;
        if (!range) {res.writeHead(416, {'Content-Range': `bytes */${info.size}`}).end(); return}
      }
      res.writeHead(range ? 206 : 200, {...headers, 'Content-Length': range ? range.end - range.start + 1 : info.size,
        ...(range ? {'Content-Range': `bytes ${range.start}-${range.end}/${info.size}`} : {})});
      if (req.method === 'HEAD') {res.end(); return}
      createReadStream(file, range).on('error', () => res.destroy()).pipe(res);
    } catch (error) {
      console.error('Preview request failed', error);
      if ((req.url ?? '').startsWith('/__edit/')) {
        if (!res.headersSent) res.writeHead(500, {'Content-Type':'application/json; charset=utf-8'});
        res.end(JSON.stringify({error: error instanceof Error ? `保存失败：${error.message}` : '保存失败，请重试'}));
      } else {
        if (!res.headersSent) res.writeHead(500);
        res.end('Preview request failed');
      }
    }
  });
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.argv[2] ?? 8790);
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw Error('预览端口无效');
  const server = await createPreviewServer({downloadsManifest: process.env.PEACH_PREVIEW_DOWNLOADS});
  server.on('error', error => {console.error(error); process.exitCode = 1});
  server.listen(port, '127.0.0.1', () => {
    const address = server.address();
    if (address && typeof address !== 'string') console.log(`http://127.0.0.1:${address.port}/`);
  });
}
