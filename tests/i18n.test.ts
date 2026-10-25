import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildLocale, translateHtml, finishTranslation, sourceCopyOverrides } from '../scripts/build_i18n.ts';
const locale = {
    attributes: { lang: { 'zh-CN': 'en' }, href: { '/': '/en/' } },
    text: { '下载': 'Download', '首页': 'Home', '<b>全在这了</b>': "<b>It's all here</b>" },
};

test('动态译文绑定当前中文，变更后报告缺译，撤销后移除绑定', () => {
    const bound = { ...locale, overrides: { title: 'New title' }, overrideSources: { title: '新标题' } };
    const source = (value: string) => `<body data-copy-overrides='${JSON.stringify({ title: value })}'></body>`;
    const report = { missing: new Set<string>(), used: new Set<string>() };
    assert.deepEqual(sourceCopyOverrides(finishTranslation('<head></head><body></body>', bound, source('新标题'), report)), { title: 'New title' });
    assert.deepEqual([...report.missing], []);
    finishTranslation('<head></head><body></body>', bound, source('另一标题'), report);
    assert.deepEqual([...report.missing], ['动态文案 title: 另一标题']);
    assert.deepEqual(sourceCopyOverrides(finishTranslation('<head></head><body></body>', bound, '<body></body>')), {});
    assert.deepEqual(sourceCopyOverrides(finishTranslation('<head></head><body></body>', bound, source(''))), { title: '' });
});
test('按整段原文替换文字与可读属性，保留文档类型和结构', () => {
    const report: {missing:Set<string>;used:Set<string>} = { missing: new Set(), used: new Set() };
    const html = translateHtml('<!doctype html>\n<html lang="zh-CN"><a href="/" aria-label="首页"> 下载 </a>'
        + `<button data-say='<b>全在这了</b>'>首页</button></html>`, locale, report);
    assert.equal(html, '<!doctype html>\n<html lang="en"><a href="/en/" aria-label="Home"> Download </a>'
        + `<button data-say='<b>It&#39;s all here</b>'>Home</button></html>`);
    assert.deepEqual([...report.missing], []);
});
test('translate="no" 子树、脚本与注释保留原文，其余缺译逐条报告', () => {
    const report: {missing:Set<string>;used:Set<string>} = { missing: new Set(), used: new Set() };
    const html = translateHtml('<div translate="no"><img alt="演示"><b>演示界面</b></div><!-- 注释 --><script>const a=\'脚本\'</script><p>新句子</p>', locale, report);
    assert.ok(html.startsWith('<div translate="no"><img alt="演示"><b>演示界面</b></div><!-- 注释 --><script>const a=\'脚本\'</script>'));
    assert.deepEqual([...report.missing], ['新句子']);
});
test('两种语言的页面各自声明一次中英文 alternate', async () => {
    for (const [file, path] of [['index.html', ''], ['en/index.html', ''], ['copyright/index.html', 'copyright/'], ['en/copyright/index.html', 'copyright/']] as const) {
        const html = await readFile(new URL(`../site/${file}`, import.meta.url), 'utf8');
        const alternates = [...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map(match => `${match[1]} ${match[2]}`);
        assert.deepEqual(alternates.filter(item => !item.startsWith('x-default')), [`zh-CN https://peach.video/${path}`, `en https://peach.video/en/${path}`], file);
    }
});
test('英文页与中文源、译文表一致', async () => {
    const report = await buildLocale('en');
    assert.deepEqual([...report.missing], [], '缺少页面译文');
    assert.deepEqual([...report.runtimeMissing], [], '缺少脚本译文');
    assert.deepEqual(report.stale, [], '存在不再使用的译文');
    assert.deepEqual(report.changed, [], '运行 npm run i18n 重新生成页面');
});
