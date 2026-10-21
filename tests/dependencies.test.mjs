import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {downloadsFor, platformFor, macArchitecture, downloadCaption} from '../site/assets/downloads.js';

test('下载说明统一展示平台和有效版本，未取得版本时保留平台名', () => {
  for (const [platform, name] of [['windows','Windows'],['macos','macOS'],['docker','Docker']]) {
    assert.equal(downloadCaption(platform,'1.2.3'), `${name} · v1.2.3`);
    assert.equal(downloadCaption(platform,'v1.2.3-rc.1'), `${name} · v1.2.3-rc.1`);
    assert.equal(downloadCaption(platform,null), name);
    assert.equal(downloadCaption(platform,'inaccessible'), name);
  }
  assert.equal(downloadCaption('other','1.2.3'),'Windows、macOS 与 Docker');
});

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
