// 脚本生成的文案也保留稳定键，供本地 ?edit 保存各个切换状态。
export function renderCopy(element: HTMLElement|null, key: string, fallback: string) {
    if (!element)
        return;
    let overrides: Record<string,string> = {};
    try {
        overrides = JSON.parse(document.body.dataset.copyOverrides || '{}');
    }
    catch { /* 使用原文 */ }
    element.dataset.copyKey = key;
    element.dataset.copyDefault = fallback;
    if (!(element.querySelector('.__ee') as HTMLElement)) {
        element.textContent = Object.hasOwn(overrides, key) ? overrides[key] : fallback;
    }
}
