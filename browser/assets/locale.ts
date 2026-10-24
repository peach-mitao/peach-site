import {resolveSiteLanguage} from './site-language.ts';
// 首页按偏好选择静态语言页；手动选择只在本浏览器保存，不发送访客标识。
(() => {
    const preferenceKey = 'peach.site.locale', entryKey = 'peach.site.entry-referrer';
    const url = new URL(location.href), valid = (value: unknown):value is 'zh'|'en' => value === 'zh' || value === 'en';
    const remember = (language: string) => { try {
        localStorage.setItem(preferenceKey, language);
        return true;
    }
    catch {
        return false;
    } };
    let saved;
    try {
        saved = localStorage.getItem(preferenceKey);
    }
    catch { }
    // 自动跳转只传递来源域名；一次读取后删除，过期值不参与统计。
    try {
        const entry = JSON.parse(sessionStorage.getItem(entryKey)!);
        sessionStorage.removeItem(entryKey);
        if (entry && entry.path === url.pathname && entry.expires > Date.now() && typeof entry.host === 'string')
            window.PEACH_ENTRY_REFERRER = entry.host;
    }
    catch { }
    const explicit = url.searchParams.get('lang');
    if (valid(explicit)) {
        saved = explicit;
        remember(explicit);
    }
    const alternate = new Map([['/','/en/'],['/copyright/','/en/copyright/'],['/credits/','/en/credits/']]).get(url.pathname);
    if (alternate && !url.searchParams.has('edit') && !/bot|crawler|spider/i.test(navigator.userAgent)) {
        const preferred = resolveSiteLanguage({path:url.pathname,saved,languages:navigator.languages?.length?navigator.languages:[navigator.language]});
        if (preferred === 'en') {
            const target = new URL(alternate, url);
            target.search = url.search;
            target.hash = url.hash;
            try {
                const host = document.referrer ? new URL(document.referrer).hostname : '';
                sessionStorage.setItem(entryKey, JSON.stringify({ host, path: target.pathname, expires: Date.now() + 10000 }));
            }
            catch { }
            window.PEACH_LOCALE_REDIRECTING = true;
            location.replace(target.href);
            return;
        }
    }
    document.addEventListener('click', event => {
        const link = event.target instanceof Element ? (event.target.closest('a[href][lang]') as HTMLAnchorElement) : null;
        if (!link)
            return;
        const target = new URL(link.href, location.href), language = link.lang.toLowerCase().split('-')[0];
        if (target.origin !== url.origin || !valid(language))
            return;
        if (!remember(language)) {
            // 存储被禁止时，显式参数仍能让手动中文入口保持中文。
            target.searchParams.set('lang', language);
            link.href = target.href;
        }
    }, true);
})();
