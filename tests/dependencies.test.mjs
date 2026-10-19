import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {downloadsFor, platformFor, macArchitecture} from '../site/assets/downloads.js';

test('Sharp 能编码并解码无损 WebP', async () => {
  const pixels = Buffer.from([255, 0, 0, 255, 0, 255, 0, 255]);
  const webp = await sharp(pixels, {raw: {width: 2, height: 1, channels: 4}}).webp({lossless: true}).toBuffer();
  assert.ok(pixels.equals(await sharp(webp).ensureAlpha().raw().toBuffer()));
});

test('下载识别依据实际浏览器芯片提示和完整公开发行包', async () => {
  const mac = {userAgent: 'Macintosh; Intel Mac OS X', platform: 'MacIntel', maxTouchPoints: 0};
  assert.equal(platformFor(mac), 'macos');
  assert.equal(await macArchitecture(mac), null);
  assert.equal(platformFor({...mac, maxTouchPoints: 5}), 'other');
  assert.equal(platformFor({userAgent: 'X11; Linux x86_64', platform: 'Linux x86_64'}), 'docker');
  assert.equal(platformFor({userAgent: 'Android; Linux arm64', platform: 'Linux arm64'}), 'other');
  assert.equal(await macArchitecture({...mac, userAgentData: {getHighEntropyValues: async () => ({architecture: 'arm', bitness: '64'})}}), 'arm64');
  const release = {tag_name: 'v2.3.4', published_at: '2030-01-01', assets: ['setup.exe', 'zip'].map(suffix => ({name: `Peach-2.3.4-windows-x64${suffix === 'zip' ? '.' : '-'}${suffix}`, state: 'uploaded'}))};
  assert.equal(downloadsFor([release]).windows.version, '2.3.4');
  assert.deepEqual(downloadsFor([{...release, assets: release.assets.slice(0, 1)}]), {});
  assert.deepEqual(downloadsFor([{...release, draft: true}]), {});
});
