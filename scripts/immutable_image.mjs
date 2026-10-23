import {readFile, writeFile} from 'node:fs/promises';
import sharp from 'sharp';

const pixels = bytes => sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject: true});

// 日期文件名是公开缓存键。同像素保留已发布字节，不同像素必须使用新文件名。
export async function writeImmutableImage(file, bytes) {
  const candidate = await pixels(bytes);
  let current;
  try {current = await readFile(file)} catch (error) {if (error.code !== 'ENOENT') throw error}
  if (current) {
    const previous = await pixels(current);
    if (previous.info.width !== candidate.info.width || previous.info.height !== candidate.info.height
      || !previous.data.equals(candidate.data)) {
      throw new Error(`截图文件名已存在且像素不同，请使用新的 PEACH_CAPTURE_DATE：${file}`);
    }
    return false;
  }
  await writeFile(file, bytes, {flag: 'wx'});
  return true;
}
