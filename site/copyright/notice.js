// 站点所有者指定的投诉地址；本页仅准备邮件，不代发。
const recipient = 'dmca@peach.video';
const form = document.querySelector('#copyright-form');
if (recipient) {
  const email = document.querySelector('#email');
  email.textContent = recipient; email.href = `mailto:${recipient}`;
  document.querySelector('#contact').hidden = false;
  document.querySelector('#configuration').hidden = true;
  document.querySelector('#prepare').disabled = false;
}
form.addEventListener('submit', event => {
  event.preventDefault();
  if (!recipient || !form.reportValidity()) return;
  const fields = new FormData(form);
  const body = [
    '版权投诉 / DMCA',
    `姓名或机构与联系人：${fields.get('claimant')}`,
    `联系邮箱：${fields.get('reply')}`,
    `联系地址与电话：${fields.get('contact')}`,
    `受保护作品及权利说明：\n${fields.get('work')}`,
    `被投诉内容网址：\n${fields.get('urls')}`,
    '我善意相信，被投诉的使用方式未获得版权人、其代理人或法律的授权。',
    '我声明通知中的信息准确，并在承担伪证责任的前提下确认，我是相关专有权利的权利人，或已获授权代表其行事。',
    `电子签名：${fields.get('signature')}`,
    `日期：${new Date().toISOString().slice(0,10)}`,
  ].join('\n\n');
  document.querySelector('#notice').value = body;
  document.querySelector('#compose').href = `mailto:${recipient}?subject=${encodeURIComponent('Peach 版权投诉 / DMCA')}&body=${encodeURIComponent(body)}`;
  document.querySelector('#result').hidden = false;
  document.querySelector('#notice').focus();
});
document.querySelector('#copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(document.querySelector('#notice').value);
    document.querySelector('#copy-status').textContent = '正文已复制。请在邮箱中检查并发送。';
  } catch {
    document.querySelector('#notice').select();
    document.querySelector('#copy-status').textContent = '请手动复制已选中的正文。';
  }
});
