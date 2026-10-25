import confetti from 'canvas-confetti';
import {resolveSiteLanguage} from './site-language.js';
import {renderCopy} from './copy.js';
import {createElement as h,createRoot,flushSync,Button,LinkButton,Note,Divider} from './boardui.js';
const local=['localhost','127.0.0.1'].includes(location.hostname);
const suffix=`; Path=/; SameSite=Lax${local?'':'; Secure; Domain=peach.video'}`;
let saved:string|null=null;try{saved=localStorage.getItem('peach.site.locale')}catch{}
const language=resolveSiteLanguage({path:location.pathname,explicit:new URLSearchParams(location.search).get('lang'),saved,languages:navigator.languages}),english=language==='en';
document.documentElement.lang=english?'en':'zh-CN';
if(english){
 const copy:Record<string,string>={
  'privacy-title':'Analytics preferences',
  'privacy-collection':'Both sites use Cloudflare Web Analytics for page views and first-party analytics for clicks, visible areas and anonymous journeys. A random session cookie shared across peach.video subdomains expires after 30 minutes of inactivity. Anonymous detailed events and their reference screenshots are retained long term. Aggregate analytics are retained for three months.',
  'privacy-scope':'First-party analytics do not collect input text, search terms, movie titles, full URLs, IP addresses or full user-agent strings. No session recordings are made. We cannot observe where you go after leaving; the exit location is the last position recorded before the session ends.',
  'analytics-off':'Opt out of first-party analytics','analytics-on':'Allow first-party analytics','privacy-home':'Back to the website','privacy-demo':'Open the demo'};
 for(const [id,text]of Object.entries(copy))document.getElementById(id)!.textContent=text;
 (document.querySelector('#privacy-home') as HTMLAnchorElement).href='/en/';
}
document.title=document.querySelector('#privacy-title')!.textContent+' · Peach';
const host=document.querySelector<HTMLElement>('#privacy-controls')!;
const root=createRoot(host);
host.classList.add('boardui-root');
const labels={
 off:english?'Opt out of first-party analytics':'停用自有统计',
 on:english?'Allow first-party analytics':'允许自有统计',
 home:english?'Back to the website':'返回官网',
 demo:english?'Open the demo':'打开演示站',
};
const locale=english?'en':'zh';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const celebration=confetti.create(undefined,{resize:true,disableForReducedMotion:true});
function isOff(){return /(?:^|;\s*)peach_analytics_off=1(?:;|$)/.test(document.cookie)}
function renderLabels(){
 const off=isOff();
 const status=english?(off?'First-party analytics are off':'First-party analytics are allowed'):(off?'自有统计已停用':'自有统计已允许');
 renderCopy(document.querySelector<HTMLElement>('#preference'),`privacy.analytics.${off?'off':'allowed'}.${locale}`,status);
 for(const [name,label]of Object.entries(labels))renderCopy(document.querySelector<HTMLElement>(`[data-privacy-label="${name}"]`),`privacy.action.${name}.${locale}`,label);
}
function optOut(){celebration.reset();document.cookie='peach_analytics_off=1; Max-Age=31536000'+suffix;document.cookie='peach_visit=; Max-Age=0'+suffix;window.PeachBehavior?.stop();display()}
function allow(){
 const off=isOff(),source=document.getElementById('analytics-on')!.getBoundingClientRect();
 celebration.reset();
 document.cookie='peach_analytics_off=; Max-Age=0'+suffix;
 display();
 if(off&&!isOff()&&!reducedMotion.matches)void celebration({particleCount:50,spread:60,startVelocity:30,ticks:120,origin:{x:Math.max(0,Math.min(1,(source.left+source.width/2)/innerWidth)),y:Math.max(0,Math.min(1,(source.top+source.height/2)/innerHeight))},disableForReducedMotion:true});
}
function display(){
 const off=isOff();
 const label=(name:keyof typeof labels)=>h('span',{'data-privacy-label':name});
 const action=h('div',{className:'flex max-w-full flex-wrap gap-2'},
  h(Button,{id:'analytics-off',variant:'secondary',hidden:off,onClick:optOut,...{'data-copy-interact':''}},label('off')),
  h(Button,{id:'analytics-on',variant:'secondary',hidden:!off,onClick:allow,...{'data-copy-interact':''}},label('on')));
 flushSync(()=>root.render(h('div',{className:'flex flex-col gap-6'},
  h(Note,{tone:'neutral',className:'privacy-state-note',action,children:h('span',{id:'preference',role:'status',className:off?'text-text-secondary':'text-notification-success-foreground'})}),
  h(Divider),
  h('nav',{className:'flex flex-wrap items-center justify-between gap-x-6 gap-y-2','aria-label':english?'Website links':'站点导航'},
   h(LinkButton,{id:'privacy-home',variant:'secondary',className:'py-2',href:english?'/en/':'/'},label('home')),
   h(LinkButton,{id:'privacy-demo',variant:'secondary',className:'py-2',href:'https://demo.peach.video/'},label('demo'))))));
 renderLabels();
}
addEventListener('peach:copy-saved',renderLabels);
addEventListener('pagehide',()=>celebration.reset());
document.addEventListener('visibilitychange',()=>{if(document.hidden)celebration.reset()});
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)celebration.reset()});
display();
