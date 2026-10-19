// 脚本生成的文案也保留稳定键，供本地 ?edit 保存各个切换状态。
export function renderCopy(element, key, fallback) {
  if (!element) return;
  let overrides = {};
  try { overrides = JSON.parse(document.body.dataset.copyOverrides || '{}'); } catch { /* 使用原文 */ }
  element.dataset.copyKey = key;
  element.dataset.copyDefault = fallback;
  if (!element.querySelector('.__ee')) {
    element.textContent = Object.hasOwn(overrides, key) ? overrides[key] : fallback;
  }
}
