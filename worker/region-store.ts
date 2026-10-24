import {cnIPv4, cnIPv6, sources} from './region-data.ts';

export const REGION_KEY = 'regions/cn/current.json';
export interface RegionTable {
  cnIPv4: readonly (readonly [number, number])[];
  cnIPv6: readonly (readonly [string, string])[];
  sources: readonly {name: string; version: string}[];
}
export interface RegionObject {etag: string; json<T>(): Promise<T>}
export interface RegionBucket {
  get(key: string): Promise<RegionObject | null>;
  put(key: string, body: string, options?: {httpMetadata?: {contentType: string}; onlyIf?: {etagMatches: string}}): Promise<unknown>;
}
export interface RegionEnv {REGION_DATA?: RegionBucket}
export const bundledTable: RegionTable = {cnIPv4, cnIPv6, sources};

export function validRanges(value: unknown, ipv6: boolean): boolean {
  if (!Array.isArray(value) || value.length === 0 || value.length > 200000) return false;
  let previous: number | string | undefined;
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 2) return false;
    const [start, end] = row;
    if (ipv6 ? ![start, end].every(item => typeof item === 'string' && /^[a-f0-9]{32}$/.test(item))
      : ![start, end].every(item => Number.isInteger(item) && item >= 0 && item <= 0xffffffff)) return false;
    if (start > end || previous !== undefined && start <= previous) return false;
    previous = end;
  }
  return true;
}
export function validRegionTable(value: unknown): value is RegionTable {
  if (!value || typeof value !== 'object') return false;
  const row = value as Partial<RegionTable>;
  return validRanges(row.cnIPv4, false) && validRanges(row.cnIPv6, true) && Array.isArray(row.sources)
    && row.sources.length === 2 && row.sources.every(source => typeof source.name === 'string' && typeof source.version === 'string');
}

const caches = new WeakMap<RegionBucket, {table: RegionTable; expires: number; pending?: Promise<RegionTable>}>();
export async function regionTable(bucket?: RegionBucket, now = Date.now()): Promise<RegionTable> {
  if (!bucket) return bundledTable;
  let cache = caches.get(bucket);
  if (!cache) {cache = {table: bundledTable, expires: 0}; caches.set(bucket, cache);}
  if (cache.expires > now) return cache.table;
  if (cache.pending) return cache.pending;
  const current = cache;
  current.pending = Promise.resolve().then(async () => {
    try {
      const object = await bucket.get(REGION_KEY);
      if (object) {
        const table = await object.json<unknown>();
        if (!validRegionTable(table)) throw Error('地区数据库格式无效');
        current.table = table;
      }
      current.expires = now + 300000;
    } catch (error) {
      current.expires = now + 60000;
      console.error('地区数据库读取失败，继续使用有效快照', error instanceof Error ? error.message : 'unknown');
    } finally {current.pending = undefined;}
    return current.table;
  });
  return current.pending;
}
