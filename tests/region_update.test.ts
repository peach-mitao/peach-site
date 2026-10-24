import test from 'node:test';
import assert from 'node:assert/strict';
import {gzipSync, zipSync, strToU8} from 'fflate';
import {readCountryArchive, updateRegionData} from '../worker/region-update.ts';
import {REGION_KEY, bundledTable, regionTable, type RegionBucket, type RegionTable} from '../worker/region-store.ts';

const table = (start = 0x01000100): RegionTable => ({cnIPv4: [[start, start + 255]], cnIPv6: [['20010250000000000000000000000000','2001025000000000000000000000ffff']], sources: [{name:'DB-IP Country Lite',version:'fixture'},{name:'IPLocate Country',version:'fixture'}]});
function archives() {
  const dbip = [...Array(200).fill('1.0.1.0,1.0.1.255,CN'), ...Array(200).fill('2001:250::,2001:250::ffff,CN'), ...Array(600).fill('1.32.192.0,1.32.192.255,HK')].join('\n') + '\n';
  const csv = ['network,continent_code,country_code,country_name', ...Array(200).fill('1.0.1.0/24,AS,CN,China'), ...Array(200).fill('2001:250::/112,AS,CN,China'), ...Array(600).fill('1.32.192.0/24,AS,HK,"Hong Kong, SAR"')].join('\r\n') + '\r\n';
  return {dbip: gzipSync(strToU8(dbip)), iplocate: zipSync({'ip-to-country-20261024.csv': strToU8(csv)})};
}
class MemoryBucket implements RegionBucket {
  rows = new Map<string, string>();
  writes: string[] = [];
  async get(key: string) {const body = this.rows.get(key); return body ? {etag:'fixture-etag', json:async <T>() => JSON.parse(body) as T} : null;}
  async put(key: string, body: string) {this.writes.push(key); this.rows.set(key,body); return {etag:'fixture-etag'};}
}

test('流式国家库解析筛选 CN、保留 IPv6 并处理带引号的国名', async () => {
  const input = archives();
  for (const kind of ['dbip','iplocate'] as const) {
    const bytes = input[kind];
    const stream = new ReadableStream<Uint8Array>({start(controller) {for(let i=0;i<bytes.length;i+=31)controller.enqueue(bytes.slice(i,i+31));controller.close();}});
    const data = await readCountryArchive(new Response(stream),kind,'fixture','https://example.test/archive');
    assert.equal(data.records,1000); assert.equal(data.cnIPv4.length,1); assert.equal(data.cnIPv6.length,1);
    assert.deepEqual(data.cnIPv4,table().cnIPv4); assert.deepEqual(data.cnIPv6,table().cnIPv6); assert.match(data.sha256,/^[a-f0-9]{64}$/);
  }
});

test('空库、下载失败与损坏压缩包拒绝作为有效快照', async () => {
  await assert.rejects(readCountryArchive(new Response('missing',{status:404}),'dbip','x','https://example.test/archive'),/HTTP 404/);
  await assert.rejects(readCountryArchive(new Response(gzipSync(strToU8('1.0.1.0,1.0.1.255,CN\n'))),'dbip','x','https://example.test/archive'),/未取得/);
  await assert.rejects(readCountryArchive(new Response(strToU8('invalid zip')),'iplocate','x','https://example.test/archive'));
});

test('两库成功后原子替换生效表，未变的网段复用来源缓存', async () => {
  const bucket = new MemoryBucket(), input = archives(), calls: string[] = [];
  bucket.rows.set(REGION_KEY,JSON.stringify(table(0x01000200)));
  const fetcher = async (url: string) => {calls.push(url); return url.includes('/commits/') ? Response.json({sha:'a'.repeat(40)}) : new Response(url.endsWith('.gz') ? input.dbip : input.iplocate);};
  const now = Date.UTC(2026,9,24);
  assert.equal((await updateRegionData(bucket,now,fetcher)).changed,true);
  const current = JSON.parse(bucket.rows.get(REGION_KEY)!); assert.deepEqual(current.cnIPv4,table().cnIPv4);
  assert.equal((await updateRegionData(bucket,now,fetcher)).changed,false);
  assert.equal(bucket.writes.filter(key=>key===REGION_KEY).length,1);
  assert.equal(calls.filter(url=>url.endsWith('.gz')||url.endsWith('.zip')).length,2);
});

test('任一来源失败保留当前生效表', async () => {
  const bucket = new MemoryBucket(), input = archives(), before = JSON.stringify(table()); bucket.rows.set(REGION_KEY,before);
  const fetcher = async (url: string) => url.includes('/commits/') ? Response.json({sha:'b'.repeat(40)}) : url.endsWith('.gz') ? new Response(input.dbip) : new Response('failed',{status:503});
  await assert.rejects(updateRegionData(bucket,Date.UTC(2026,9,24),fetcher),/HTTP 503/);
  assert.equal(bucket.rows.get(REGION_KEY),before); assert.equal(bucket.writes.includes(REGION_KEY),false);
});

test('读取合并并发请求并在五分钟后取得更新', async () => {
  const bucket = new MemoryBucket(); bucket.rows.set(REGION_KEY,JSON.stringify(table())); let reads=0;
  const get=bucket.get.bind(bucket); bucket.get=async key=>{reads++;return get(key);};
  const values=await Promise.all(Array.from({length:12},()=>regionTable(bucket,1)));
  assert.equal(reads,1); assert.deepEqual(values[0].cnIPv4,table().cnIPv4);
  bucket.rows.set(REGION_KEY,JSON.stringify(table(0x01000200)));
  assert.deepEqual((await regionTable(bucket,1000)).cnIPv4,table().cnIPv4);
  assert.deepEqual((await regionTable(bucket,300002)).cnIPv4,table(0x01000200).cnIPv4); assert.equal(reads,2);
});

test('无效远端数据保留实例有效表，冷启动使用内置快照', async () => {
  const bucket = new MemoryBucket(); bucket.rows.set(REGION_KEY,JSON.stringify(table())); await regionTable(bucket,1);
  bucket.rows.set(REGION_KEY,JSON.stringify({cnIPv4:[],cnIPv6:[],sources:[]}));
  assert.deepEqual((await regionTable(bucket,300002)).cnIPv4,table().cnIPv4);
  const cold = new MemoryBucket(); cold.rows.set(REGION_KEY,'{}');
  assert.equal(await regionTable(cold,1),bundledTable);
});
