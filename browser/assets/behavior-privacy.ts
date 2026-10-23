const local=['localhost','127.0.0.1'].includes(location.hostname);
const suffix=`; Path=/; SameSite=Lax${local?'':'; Secure; Domain=peach.video'}`;
function display(){const off=/(?:^|;\s*)peach_analytics_off=1(?:;|$)/.test(document.cookie);document.querySelector('#preference')!.textContent=off?'自有统计已停用 / First-party analytics are off':'自有统计已允许 / First-party analytics are allowed'}
document.querySelector('#analytics-off')!.addEventListener('click',()=>{document.cookie='peach_analytics_off=1; Max-Age=31536000'+suffix;document.cookie='peach_visit=; Max-Age=0'+suffix;window.PeachBehavior?.stop();display()});
document.querySelector('#analytics-on')!.addEventListener('click',()=>{document.cookie='peach_analytics_off=; Max-Age=0'+suffix;display()});display();
