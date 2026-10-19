import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

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
