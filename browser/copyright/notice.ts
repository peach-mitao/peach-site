import { t } from '../assets/i18n.ts';
// 站点所有者指定的投诉地址；本页仅准备邮件，不代发。
const recipient = document.querySelector<HTMLAnchorElement>('#email')!.getAttribute('href')!.slice('mailto:'.length);
const form = (document.querySelector('#copyright-form') as HTMLFormElement);
if (recipient) {
    const prepare=document.querySelector<HTMLButtonElement>('#prepare')!;
    prepare.disabled=false;
    prepare.removeAttribute('aria-busy');
}
form.addEventListener('submit', event => {
    event.preventDefault();
    if (!recipient || !form.reportValidity())
        return;
    const fields = new FormData(form);
    const body = [
        t('版权投诉 / DMCA'),
        t('姓名或机构与联系人：') + fields.get('claimant'),
        t('联系邮箱：') + fields.get('reply'),
        t('联系地址与电话：') + fields.get('contact'),
        t('受保护作品及权利说明：') + '\n' + fields.get('work'),
        t('被投诉内容网址：') + '\n' + fields.get('urls'),
        t('我善意相信，被投诉的使用方式未获得版权人、其代理人或法律的授权。'),
        t('我声明通知中的信息准确，并在承担伪证责任的前提下确认，我是相关专有权利的权利人，或已获授权代表其行事。'),
        t('电子签名：') + fields.get('signature'),
        t('日期：') + new Date().toISOString().slice(0, 10),
    ].join('\n\n');
    (document.querySelector('#notice') as HTMLTextAreaElement).value = body;
    (document.querySelector('#compose') as HTMLAnchorElement).href = `mailto:${recipient}?subject=${encodeURIComponent(t('Peach 版权投诉 / DMCA'))}&body=${encodeURIComponent(body)}`;
    (document.querySelector('#result') as HTMLElement).hidden = false;
    (document.querySelector('#notice') as HTMLElement).focus();
});
(document.querySelector('#copy') as HTMLElement).addEventListener('click', async () => {
    try {
        await navigator.clipboard.writeText((document.querySelector('#notice') as HTMLTextAreaElement).value);
        (document.querySelector('#copy-status') as HTMLElement).textContent = t('正文已复制。请在邮箱中检查并发送。');
    }
    catch {
        (document.querySelector('#notice') as HTMLTextAreaElement).select();
        (document.querySelector('#copy-status') as HTMLElement).textContent = t('请手动复制已选中的正文。');
    }
});
