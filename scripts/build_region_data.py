"""将已下载的国家数据库导出为 Worker 使用的大陆网段并集。"""

from __future__ import annotations

import argparse
import csv
import gzip
import hashlib
import io
import ipaddress
import json
import re
import zipfile
from pathlib import Path


def merge(ranges: list[tuple[int, int]]) -> list[tuple[int, int]]:
    result: list[tuple[int, int]] = []
    for start, end in sorted(ranges):
        if result and start <= result[-1][1] + 1:
            result[-1] = result[-1][0], max(end, result[-1][1])
        else:
            result.append((start, end))
    return result


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dbip", type=Path, required=True)
    parser.add_argument("--dbip-month", required=True)
    parser.add_argument("--iplocate", type=Path, required=True)
    parser.add_argument("--iplocate-revision", required=True)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not re.fullmatch(r"\d{4}-\d{2}", args.dbip_month):
        parser.error("DB-IP 版本须为 YYYY-MM")
    if not re.fullmatch(r"[a-f0-9]{40}", args.iplocate_revision):
        parser.error("IPLocate 版本须为完整 Git 提交号")
    ranges: dict[int, list[tuple[int, int]]] = {4: [], 6: []}
    sources: list[dict] = []
    for name, file in [("DB-IP Country Lite", args.dbip), ("IPLocate Country", args.iplocate)]:
        source_ranges: dict[int, list[tuple[int, int]]] = {4: [], 6: []}
        total = 0
        samples: dict[str, dict[str, str]] = {}
        if name.startswith("DB-IP"):
            with gzip.open(file, "rt", encoding="utf-8", newline="") as stream:
                for start, end, country in csv.reader(stream):
                    total += 1
                    first, last = ipaddress.ip_address(start), ipaddress.ip_address(end)
                    if first.version != last.version or int(first) > int(last):
                        raise ValueError("DB-IP 地址范围无效")
                    if country in {"CN", "HK", "MO", "TW"}:
                        samples.setdefault(country, {}).setdefault(str(first.version), str(first))
                    if country == "CN":
                        source_ranges[first.version].append((int(first), int(last)))
            version = args.dbip_month
            url = f"https://download.db-ip.com/free/dbip-country-lite-{version}.csv.gz"
            license_name = "CC-BY-4.0"
            attribution = "https://db-ip.com/"
        else:
            with zipfile.ZipFile(file) as archive:
                names = [name for name in archive.namelist() if name.endswith(".csv")]
                if len(names) != 1:
                    raise ValueError("IPLocate 压缩包须包含一个 CSV")
                with io.TextIOWrapper(archive.open(names[0]), encoding="utf-8", newline="") as stream:
                    for row in csv.DictReader(stream):
                        total += 1
                        network = ipaddress.ip_network(row["network"])
                        country = row["country_code"]
                        if country in {"CN", "HK", "MO", "TW"}:
                            samples.setdefault(country, {}).setdefault(str(network.version), str(network.network_address))
                        if country == "CN":
                            source_ranges[network.version].append((int(network.network_address), int(network.broadcast_address)))
            version = args.iplocate_revision
            url = f"https://media.githubusercontent.com/media/iplocate/ip-address-databases/{version}/ip-to-country/ip-to-country.csv.zip"
            license_name = "CC-BY-SA-4.0"
            attribution = "https://www.iplocate.io/"
        if total < 1000 or not all(source_ranges.values()):
            raise ValueError(f"{name} 国家库或 CN IPv4/IPv6 网段未取得")
        for family in [4, 6]:
            ranges[family].extend(source_ranges[family])
        sources.append({"name": name, "version": version, "url": url, "license": license_name,
                        "attribution": attribution, "sha256": hashlib.sha256(file.read_bytes()).hexdigest(),
                        "records": total, "cnIPv4": len(source_ranges[4]), "cnIPv6": len(source_ranges[6]), "samples": samples})
    combined = {family: merge(rows) for family, rows in ranges.items()}
    root = Path(__file__).resolve().parent.parent
    output = args.output or root / ("worker" if (root / "worker").is_dir() else "src") / "region-data.ts"
    text = "// 国家库的 CN 网段并集；由 scripts/build_region_data.py 生成。\n"
    text += "// 数据许可：CC-BY-SA-4.0；保留 DB-IP 与 IPLocate 来源，代码许可见仓库 LICENSE。\n"
    text += "export const sources = " + json.dumps(sources, ensure_ascii=False, separators=(",", ":")) + ";\n"
    text += "export const cnIPv4: readonly (readonly [number, number])[] = " + json.dumps(combined[4], separators=(",", ":")) + ";\n"
    ipv6 = [[f"{start:032x}", f"{end:032x}"] for start, end in combined[6]]
    text += "export const cnIPv6: readonly (readonly [string, string])[] = " + json.dumps(ipv6, separators=(",", ":")) + ";\n"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(text, encoding="utf-8")
    print(json.dumps({"sources": sources, "unionIPv4": len(combined[4]), "unionIPv6": len(combined[6]), "bytes": len(text.encode("utf-8"))}, ensure_ascii=False))


if __name__ == "__main__":
    main()
