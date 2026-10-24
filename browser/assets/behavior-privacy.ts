import {resolveSiteLanguage} from './site-language.ts';
const local=['localhost','127.0.0.1'].includes(location.hostname);
const suffix=`; Path=/; SameSite=Lax${local?'':'; Secure; Domain=peach.video'}`;
let saved:string|null=null;try{saved=localStorage.getItem('peach.site.locale')}catch{}
const language=resolveSiteLanguage({path:location.pathname,explicit:new URLSearchParams(location.search).get('lang'),saved,languages:navigator.languages}),english=language==='en';
document.documentElement.lang=english?'en':'zh-CN';
if(english){
 const copy:Record<string,string>={
  'privacy-title':'Analytics preferences',
  'privacy-collection':'Both sites use Cloudflare Web Analytics for page views and first-party analytics for clicks, visible areas and anonymous journeys. A random session cookie shared across peach.video subdomains expires after 30 minutes of inactivity. Detailed events are retained for 30 days; reference screenshots are removed when their associated data expires. Aggregate analytics are retained for three months.',
  'privacy-scope':'First-party analytics do not collect input text, search terms, movie titles, full URLs, IP addresses or full user-agent strings. No session recordings are made. We cannot observe where you go after leaving; the exit location is the last position recorded before the session ends.',
  'analytics-off':'Opt out of first-party analytics','analytics-on':'Allow first-party analytics','privacy-home':'Back to the website','privacy-demo':'Open the demo'};
 for(const [id,text]of Object.entries(copy))document.getElementById(id)!.textContent=text;
 (document.querySelector('#privacy-home') as HTMLAnchorElement).href='/en/';
}
document.title=document.querySelector('#privacy-title')!.textContent+' · Peach';
function display(){const off=/(?:^|;\s*)peach_analytics_off=1(?:;|$)/.test(document.cookie);document.querySelector('#preference')!.textContent=english?(off?'First-party analytics are off':'First-party analytics are allowed'):(off?'自有统计已停用':'自有统计已允许');(document.querySelector('#analytics-off') as HTMLButtonElement).hidden=off;(document.querySelector('#analytics-on') as HTMLButtonElement).hidden=!off}
document.querySelector('#analytics-off')!.addEventListener('click',()=>{document.cookie='peach_analytics_off=1; Max-Age=31536000'+suffix;document.cookie='peach_visit=; Max-Age=0'+suffix;window.PeachBehavior?.stop();display()});
document.querySelector('#analytics-on')!.addEventListener('click',()=>{document.cookie='peach_analytics_off=; Max-Age=0'+suffix;display()});display();
