import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
const code = await readFile(new URL('../site/assets/locale.js', import.meta.url), 'utf8');
function run({ path = '/', languages = ['en-US'], saved, blocked = false, session = new Map(), referrer = '' }:{path?:string;languages?:string[];saved?:string;blocked?:boolean;session?:Map<string,string>;referrer?:string} = {}) {
    const stored = new Map(saved ? [['peach.site.locale', saved]] : []), listeners: Record<string,(event:unknown)=>void> = {}, redirects: any[] = [];
    const storage = (map: Map<any,any>) => ({ getItem: (key: any) => map.get(key) ?? null, setItem: (key: any, value: any) => { map.set(key, value); }, removeItem: (key: any) => map.delete(key) });
    const location: URL&{replace?:(url:string)=>number} = new URL(path, 'https://peach.video');
    location.replace = (url: any) => redirects.push(url);
    class Element {
        closest() { return this; }
    }
    const scope: Record<string,any> = { URL, Date, Element, window: {}, location, navigator: { languages, language: languages[0], userAgent: 'Browser' },
        document: { referrer, addEventListener: (name: string|number, listener: any) => { listeners[name] = listener; } }, sessionStorage: storage(session) };
    Object.defineProperty(scope, 'localStorage', { get: () => { if (blocked)
            throw Error('Blocked'); return storage(stored); } });
    vm.runInNewContext(code, scope);
    return { scope, stored, session, redirects, click: (lang: any, href: any) => { const link = Object.assign(new Element(), { lang, href }); listeners.click({ target: link }); return link.href; } };
}
test('首页按浏览器语言优先级选择，未匹配时使用英文', () => {
    assert.equal(run({ languages: ['zh-TW', 'en-US'] }).redirects.length, 0);
    assert.equal(run({ languages: ['ja-JP', 'zh-CN', 'en'] }).redirects.length, 0);
    assert.equal(run({ languages: ['en-US', 'zh-CN'] }).redirects[0], 'https://peach.video/en/');
    assert.equal(run({ languages: ['ja-JP'] }).redirects[0], 'https://peach.video/en/');
});
test('手动偏好与显式语言参数优先，跳转保留推广参数和锚点', () => {
    assert.equal(run({ saved: 'zh' }).redirects.length, 0);
    assert.equal(run({ saved: 'en', languages: ['zh-CN'], path: '/?utm_source=github#download' }).redirects[0], 'https://peach.video/en/?utm_source=github#download');
    assert.equal(run({ path: '/?lang=zh', saved: 'en' }).redirects.length, 0);
    assert.equal(run({ saved: 'unknown' }).redirects.length, 1);
});
test('英文直链与编辑模式保持显式地址，版权页按偏好选择语言', () => {
    for (const path of ['/en/', '/en/copyright/', '/?edit', '/copyright/?edit'] as const)
        assert.equal(run({ path }).redirects.length, 0, path);
    assert.equal(run({path:'/copyright/'}).redirects[0],'https://peach.video/en/copyright/');
    assert.equal(run({path:'/copyright/?lang=zh',saved:'en'}).redirects.length,0);
});
test('手动切换只记录同源语言选择，存储被禁时保留显式参数', () => {
    const chosen = run({ path: '/en/' });
    chosen.click('zh-CN', 'https://peach.video/');
    assert.equal(chosen.stored.get('peach.site.locale'), 'zh');
    chosen.click('en', 'https://example.com/');
    assert.equal(chosen.stored.get('peach.site.locale'), 'zh');
    assert.equal(run({ path: '/en/', blocked: true }).click('zh-CN', 'https://peach.video/#faq'), 'https://peach.video/?lang=zh#faq');
});
test('自动跳转来源只携带域名，一次读取后删除并拒绝过期值', () => {
    const first = run({ referrer: 'https://example.com/private?secret=value' });
    assert.equal(first.scope.window.PEACH_LOCALE_REDIRECTING, true);
    assert.equal(first.session.size, 1);
    assert.ok(![...first.session.values()][0].includes('secret'));
    const next = run({ path: '/en/', session: first.session });
    assert.equal(next.scope.window.PEACH_ENTRY_REFERRER, 'example.com');
    assert.equal(next.session.size, 0);
    const expired = new Map([['peach.site.entry-referrer', JSON.stringify({ host: 'old.example', path: '/en/', expires: 0 })]]);
    assert.equal(run({ path: '/en/', session: expired }).scope.window.PEACH_ENTRY_REFERRER, undefined);
});
