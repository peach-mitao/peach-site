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
  const child = spawn(process.execPath, [fileURLToPath(new URL('./check_downloads.mjs', import.meta.url)), `http://127.0.0.1:${port}/`], {stdio: 'inherit'});
  const [code] = await once(child, 'exit');
  if (code !== 0) process.exitCode = code ?? 1;
} finally {
  server.closeAllConnections();
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
