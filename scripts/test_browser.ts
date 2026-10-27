import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { createPreviewServer } from './serve.ts';
// 使用真实页面、临时回环端口与合成 Release 响应，不依赖公网 GitHub API 或录制包。
const manifest = JSON.parse(await readFile(new URL('../assets-manifest.json', import.meta.url), 'utf8')) as {files: {path: string}[]};
const screenshots = new Set(manifest.files.filter(item => item.path.startsWith('assets/screenshots/')).map(item => '/' + item.path));
const screenshot = '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#18191a"/></svg>';
const server = await createPreviewServer({async dynamic(req, res) {
    if (!screenshots.has(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)) return false;
    res.writeHead(200, {'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store'}).end(screenshot);
    return true;
}});
try {
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const { port } = server.address() as import('node:net').AddressInfo;
    for (const [file, args] of [['check_locale.ts', [`http://127.0.0.1:${port}/`]], ['check_support.ts', [`http://127.0.0.1:${port}/`]], ['check_downloads.ts', [`http://127.0.0.1:${port}/`]], ['check_download_cache.ts', []], ['check_preferences.ts', []], ['check_analytics.ts', [`http://127.0.0.1:${port}/`]], ['check_interface.ts', [`http://127.0.0.1:${port}/`]], ['check_edit.ts', []]] as const) {
        const child = spawn(process.execPath, [fileURLToPath(new URL(file, import.meta.url)), ...args], { stdio: 'inherit' });
        const [code] = await once(child, 'exit');
        if (code !== 0) {
            process.exitCode = code ?? 1;
            break;
        }
    }
}
finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
