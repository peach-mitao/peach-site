import ipaddr from 'ipaddr.js';
import {bundledTable, type RegionTable} from './region-store.ts';

function contains<T extends number | string>(ranges: readonly (readonly [T, T])[], value: T): boolean {
  let low = 0, high = ranges.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1, [start, end] = ranges[middle];
    if (value < start) high = middle - 1;
    else if (value > end) low = middle + 1;
    else return true;
  }
  return false;
}

export function mainlandIP(value: string | null, table: RegionTable = bundledTable): boolean {
  if (!value || !ipaddr.isValid(value)) return false;
  const address = ipaddr.process(value), bytes = address.toByteArray();
  if (address.kind() === 'ipv4') return contains(table.cnIPv4, bytes.reduce((total, byte) => total * 256 + byte, 0));
  return contains(table.cnIPv6, bytes.map(byte => byte.toString(16).padStart(2, '0')).join(''));
}
