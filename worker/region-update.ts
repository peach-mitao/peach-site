import ipaddr from 'ipaddr.js';
import {parse} from 'csv-parse/stream';
import {Unzip, UnzipInflate} from 'fflate';
import {REGION_KEY, bundledTable, validRanges, validRegionTable, type RegionBucket, type RegionTable} from './region-store.ts';

export const REGION_CRON = '30 6 * * *';
interface SourceData {
  name: string; version: string; url: string; sha256: string; records: number;
  cnIPv4: [number, number][]; cnIPv6: [string, string][];
}
type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

const digest = async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
const rangeHash = (table: RegionTable) => digest(new TextEncoder().encode(JSON.stringify({cnIPv4: table.cnIPv4, cnIPv6: table.cnIPv6})));

function merge(rows: [bigint, bigint][]): [bigint, bigint][] {
  const output: [bigint, bigint][] = [];
  for (const [start, end] of rows.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)) {
    const last = output.at(-1);
    if (last && start <= last[1] + 1n) last[1] = end > last[1] ? end : last[1];
    else output.push([start, end]);
  }
  return output;
}
function number(address: ipaddr.IPv4 | ipaddr.IPv6): bigint {
  return address.toByteArray().reduce((value, byte) => value * 256n + BigInt(byte), 0n);
}
function output(rows: {v4: [bigint, bigint][]; v6: [bigint, bigint][]}) {
  return {
    cnIPv4: merge(rows.v4).map(([start, end]): [number, number] => [Number(start), Number(end)]),
    cnIPv6: merge(rows.v6).map(([start, end]): [string, string] => [start.toString(16).padStart(32, '0'), end.toString(16).padStart(32, '0')]),
  };
}
export function unionSources(sources: SourceData[]): RegionTable {
  return {...output({
    v4: sources.flatMap(source => source.cnIPv4.map(([start, end]): [bigint, bigint] => [BigInt(start), BigInt(end)])),
    v6: sources.flatMap(source => source.cnIPv6.map(([start, end]): [bigint, bigint] => [BigInt('0x' + start), BigInt('0x' + end)])),
  }), sources: sources.map(({cnIPv4, cnIPv6, ...metadata}) => ({...metadata, cnIPv4: cnIPv4.length, cnIPv6: cnIPv6.length}))};
}

function zipCSV(): TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>> {
  let files = 0, complete = false;
  let unzip: Unzip;
  return new TransformStream({
    start(controller) {
      unzip = new Unzip(file => {
        if (!/^ip-to-country(?:-\d{8})?\.csv$/.test(file.name)) throw Error('IPLocate 压缩包文件名无效');
        if (++files !== 1) throw Error('IPLocate 压缩包须有一个 CSV');
        file.ondata = (error, chunk, final) => {if (error) throw error; controller.enqueue(chunk); if (final) complete = true;};
        file.start();
      });
      unzip.register(UnzipInflate);
    },
    transform(chunk) {unzip.push(chunk);},
    flush() {unzip.push(new Uint8Array(), true); if (files !== 1 || !complete) throw Error('IPLocate 压缩包不完整');},
  });
}

export async function readCountryArchive(response: Response, kind: 'dbip' | 'iplocate', version: string, url: string): Promise<SourceData> {
  if (!response.ok || !response.body) throw Error(`${kind} 数据下载失败：HTTP ${response.status}`);
  const chunks: Uint8Array<ArrayBuffer>[] = [];
  let compressed = 0;
  const archive = response.body.pipeThrough(new TransformStream<Uint8Array<ArrayBuffer>, Uint8Array<ArrayBuffer>>({transform(chunk, controller) {
    compressed += chunk.length;
    if (compressed > 64 * 1024 * 1024) throw Error('国家库归档超过支持大小');
    chunks.push(chunk.slice()); controller.enqueue(chunk);
  }}));
  const decoded = kind === 'dbip' ? archive.pipeThrough(new DecompressionStream('gzip')) : archive.pipeThrough(zipCSV());
  const csv = decoded.pipeThrough(parse({skip_empty_lines: true, max_record_size: 4096}) as TransformStream<Uint8Array<ArrayBuffer>, string[]>);
  const reader = csv.getReader(), rows: {v4: [bigint, bigint][]; v6: [bigint, bigint][]} = {v4: [], v6: []};
  let records = 0, header = kind === 'dbip';
  try {
    while (true) {
      const {value, done} = await reader.read(); if (done) break;
      if (!header) {if (value.join(',') !== 'network,continent_code,country_code,country_name') throw Error('IPLocate CSV 表头无效'); header = true; continue;}
      if (++records > 10000000 || value.length !== (kind === 'dbip' ? 3 : 4) || !/^[A-Z]{2}$/.test(value[2])) throw Error('国家库记录格式无效');
      if (value[2] !== 'CN') continue;
      let first: bigint, last: bigint, family: string;
      if (kind === 'dbip') {
        const start = ipaddr.parse(value[0]), end = ipaddr.parse(value[1]);
        if (start.kind() !== end.kind()) throw Error('DB-IP 地址范围不一致');
        family = start.kind(); first = number(start); last = number(end);
      } else {
        const [address, prefix] = ipaddr.parseCIDR(value[0]);
        family = address.kind(); const bits = BigInt((family === 'ipv4' ? 32 : 128) - prefix);
        first = number(address); if (first >> bits << bits !== first) throw Error('IPLocate 网段地址无效');
        last = first + (1n << bits) - 1n;
      }
      if (first > last) throw Error('国家库地址范围无效');
      (family === 'ipv4' ? rows.v4 : rows.v6).push([first, last]);
    }
  } catch (error) {await reader.cancel(error).catch(() => {}); throw error;}
  finally {reader.releaseLock();}
  if (records < 1000 || rows.v4.length < 100 || rows.v6.length < 100) throw Error('国家库 CN IPv4/IPv6 数据未取得');
  const bytes = new Uint8Array(compressed); let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
  return {name: kind === 'dbip' ? 'DB-IP Country Lite' : 'IPLocate Country', version, url, sha256: await digest(bytes), records, ...output(rows)};
}

async function source(bucket: RegionBucket, kind: 'dbip' | 'iplocate', version: string, url: string, fetcher: Fetcher): Promise<SourceData> {
  const key = `regions/sources/${kind}.json`, object = await bucket.get(key);
  if (object) {
    const cached = await object.json<SourceData>();
    if (cached.version === version && validRanges(cached.cnIPv4, false) && validRanges(cached.cnIPv6, true)) return cached;
  }
  const data = await readCountryArchive(await fetcher(url, {signal: AbortSignal.timeout(300000)}), kind, version, url);
  await bucket.put(key, JSON.stringify(data), {httpMetadata: {contentType: 'application/json'}});
  return data;
}

export async function updateRegionData(bucket: RegionBucket, now = Date.now(), fetcher: Fetcher = fetch) {
  const response = await fetcher('https://api.github.com/repos/iplocate/ip-address-databases/commits/main', {headers: {'user-agent': 'Peach-Region-Updater', accept: 'application/vnd.github+json'}, signal: AbortSignal.timeout(30000)});
  if (!response.ok) throw Error(`IPLocate 版本查询失败：HTTP ${response.status}`);
  const commit = await response.json() as {sha?: string};
  if (!commit.sha || !/^[a-f0-9]{40}$/.test(commit.sha)) throw Error('IPLocate 提交号无效');
  const month = new Date(now).toISOString().slice(0, 7);
  const current = await bucket.get(REGION_KEY), previous: unknown = current ? await current.json() : bundledTable;
  if (!validRegionTable(previous)) throw Error('当前地区快照无效，停止更新');
  const dbip = await source(bucket, 'dbip', month, `https://download.db-ip.com/free/dbip-country-lite-${month}.csv.gz`, fetcher);
  const iplocate = await source(bucket, 'iplocate', commit.sha, `https://media.githubusercontent.com/media/iplocate/ip-address-databases/${commit.sha}/ip-to-country/ip-to-country.csv.zip`, fetcher);
  const table = unionSources([dbip, iplocate]);
  if (!validRegionTable(table)) throw Error('合并地区快照无效');
  for (const key of ['cnIPv4', 'cnIPv6'] as const) if (table[key].length < previous[key].length / 2 || table[key].length > previous[key].length * 2) throw Error('大陆网段数量变化异常，保留当前数据');
  const hash = await rangeHash(table), changed = hash !== await rangeHash(previous);
  if (changed || !current) {
    const result = await bucket.put(REGION_KEY, JSON.stringify({...table, hash, updatedAt: new Date(now).toISOString()}), {
      httpMetadata: {contentType: 'application/json'}, ...(current ? {onlyIf: {etagMatches: current.etag}} : {}),
    });
    if (result === null) throw Error('地区快照已被其他更新替换');
  }
  console.log(JSON.stringify({job: 'region-update', changed, hash, sources: table.sources, cnIPv4: table.cnIPv4.length, cnIPv6: table.cnIPv6.length}));
  return {changed, hash, cnIPv4: table.cnIPv4.length, cnIPv6: table.cnIPv6.length};
}
