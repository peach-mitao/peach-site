// 查询官网埋点：读 Workers Analytics Engine 的 SQL API，按预设报表输出表格。
// 需要 CLOUDFLARE_ACCOUNT_ID 与具备 Account Analytics Read 权限的 CLOUDFLARE_API_TOKEN。
import {parseArgs} from 'node:util';
import {pathToFileURL} from 'node:url';
import {BLOBS} from '../worker/events.ts';

export const DATASET = 'peach_site_events';
const column = name => {
  const index = BLOBS.indexOf(name);
  if (index < 0) throw new Error(`未知列 ${name}`);
  return `blob${index + 1}`;
};

// 每条报表：事件名、分组列。计数用 SUM(_sample_interval) 还原采样前的条数。
export const REPORTS = {
  languages: {title: '首选语言与所看页面', event: 'pageview', columns: ['pref_lang', 'page_lang']},
  readable: {title: '可读语言组合（按偏好排序的前三种）', event: 'pageview', columns: ['pref_langs']},
  countries: {title: '国家与首选语言', event: 'pageview', columns: ['country', 'pref_lang']},
  switches: {title: '语言切换', event: 'lang_switch', columns: ['page_lang', 'detail', 'pref_lang']},
  downloads: {title: '下载点击', event: 'download', columns: ['detail', 'os', 'os_version']},
  systems: {title: '系统与浏览器', event: 'pageview', columns: ['os', 'os_version', 'browser', 'browser_version', 'device']},
  sources: {title: '来源', event: 'pageview', columns: ['referrer', 'utm_source']},
  actions: {title: '其余操作', event: ['platform', 'mac_help', 'faq'], columns: ['event', 'detail', 'page_lang']},
};

export function reportSql(report, days) {
  if (!Number.isInteger(days) || days < 1 || days > 90) throw new Error('天数须为 1 到 90 的整数（数据保留三个月）');
  const events = [report.event].flat().map(event => `index1 = '${event}'`).join(' OR ');
  const select = report.columns.map(name => `${column(name)} AS ${name}`).join(', ');
  return `SELECT ${select}, SUM(_sample_interval) AS hits FROM ${DATASET}`
    + ` WHERE (${events}) AND timestamp > NOW() - INTERVAL '${days}' DAY`
    + ` GROUP BY ${report.columns.join(', ')} ORDER BY hits DESC LIMIT 50 FORMAT JSON`;
}

export async function querySql(sql, {account, token, fetch: request = fetch}) {
  const response = await request(`https://api.cloudflare.com/client/v4/accounts/${account}/analytics_engine/sql`, {
    method: 'POST', headers: {Authorization: `Bearer ${token}`}, body: sql,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`SQL API 返回 ${response.status}：${text.slice(0, 300)}`);
  return JSON.parse(text).data;
}

export function formatTable(rows, columns) {
  if (!rows.length) return '（无数据）';
  const total = rows.reduce((sum, row) => sum + Number(row.hits), 0);
  const header = [...columns, 'hits', 'share'];
  const body = rows.map(row => [...columns.map(name => String(row[name] || '（空）')), String(Number(row.hits)),
    `${(Number(row.hits) / total * 100).toFixed(1)}%`]);
  const widths = header.map((name, index) => Math.max(name.length, ...body.map(line => line[index].length)));
  return [header, ...body].map(line => line.map((cell, index) => cell.padEnd(widths[index])).join('  ').trimEnd()).join('\n');
}

async function main() {
  const {values} = parseArgs({options: {days: {type: 'string', default: '30'}, report: {type: 'string', multiple: true}}});
  const account = process.env.CLOUDFLARE_ACCOUNT_ID, token = process.env.CLOUDFLARE_API_TOKEN;
  if (!account || !token) throw new Error('请设置 CLOUDFLARE_ACCOUNT_ID 与 CLOUDFLARE_API_TOKEN（Account Analytics Read）');
  const names = values.report ?? Object.keys(REPORTS);
  for (const name of names) {
    const report = REPORTS[name];
    if (!report) throw new Error(`未知报表 ${name}，可选：${Object.keys(REPORTS).join('、')}`);
    const rows = await querySql(reportSql(report, Number(values.days)), {account, token});
    console.log(`\n## ${report.title}（近 ${values.days} 天）\n${formatTable(rows, report.columns)}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
