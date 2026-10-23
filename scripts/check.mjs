import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyCopyEditor} from './sync_copy_editor.mjs';
import {cacheHeaders} from './cache_headers.mjs';

async function check(directory) {
  for (const entry of await readdir(directory, {withFileTypes: true})) {
    if (entry.name === 'vendor') continue;
    const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
    if (entry.isDirectory()) await check(file);
    else if (/\.(mjs|js)$/.test(entry.name)) {
      const result = spawnSync(process.execPath, ['--check', fileURLToPath(file)], {stdio: 'inherit'});
      if (result.error) throw result.error;
      if (result.status !== 0) process.exit(result.status ?? 1);
    }
  }
}
for (const directory of ['scripts/', 'tests/', 'site/']) await check(new URL('../' + directory, import.meta.url));
const result = spawnSync(process.execPath, ['--check', fileURLToPath(new URL('../edit-client.js', import.meta.url))], {stdio: 'inherit'});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
await verifyCopyEditor();
await cacheHeaders({check: true});
// 外语页面须与中文源和译文表一致：缺译、多余译文或未重新生成都会失败。
const i18n = spawnSync(process.execPath, [fileURLToPath(new URL('./build_i18n.mjs', import.meta.url)), '--check'], {stdio: 'inherit'});
if (i18n.error) throw i18n.error;
if (i18n.status !== 0) process.exit(i18n.status ?? 1);
