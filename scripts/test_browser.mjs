import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import {createPreviewServer} from './serve.ts';

// 使用真实页面、临时回环端口与合成 Release 响应，不依赖公网 GitHub API 或录制包。
const server = await createPreviewServer();
try {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const {port} = server.address();
  for (const [file,args] of [['check_downloads.mjs',[`http://127.0.0.1:${port}/`]],['check_analytics.mjs',[`http://127.0.0.1:${port}/`]],['check_interface.mjs',[`http://127.0.0.1:${port}/`]],['check_edit.mjs',[]]]) {
    const child = spawn(process.execPath, [fileURLToPath(new URL(file, import.meta.url)),...args], {stdio: 'inherit'});
    const [code] = await once(child, 'exit');
    if (code !== 0) {process.exitCode = code ?? 1;break}
  }
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
