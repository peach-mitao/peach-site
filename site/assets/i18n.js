// 生成的外语页面注入 window.PEACH_I18N 词表；中文页没有词表，原文照常返回。
export const t = text => globalThis.PEACH_I18N?.[text] ?? text;
