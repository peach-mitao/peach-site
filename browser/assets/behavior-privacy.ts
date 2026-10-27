import confetti from 'canvas-confetti';
import {renderCopy} from './copy.js';
import {createRoot,flushSync} from './boardui.js';
import {privacyLabels,privacyStatus} from './privacy-copy.js';
import {privacyView} from './privacy-view.js';
const local=['localhost','127.0.0.1'].includes(location.hostname);
const suffix=`; Path=/; SameSite=Lax${local?'':'; Secure; Domain=peach.video'}`;
const english=document.documentElement.lang==='en';
const host=document.querySelector<HTMLElement>('#privacy-controls')!;
const root=createRoot(host);
host.classList.add('boardui-root');
const labels=privacyLabels(english);
const locale=english?'en':'zh';
const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)');
const celebration=confetti.create(undefined,{resize:true,disableForReducedMotion:true});
function isOff(){return /(?:^|;\s*)peach_analytics_off=1(?:;|$)/.test(document.cookie)}
function renderLabels(){
 const off=isOff();
 const status=privacyStatus(english,off);
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
 flushSync(()=>root.render(privacyView({off,english,onOptOut:optOut,onAllow:allow})));
 renderLabels();
}
addEventListener('peach:copy-saved',renderLabels);
addEventListener('pagehide',()=>celebration.reset());
document.addEventListener('visibilitychange',()=>{if(document.hidden)celebration.reset()});
reducedMotion.addEventListener('change',()=>{if(reducedMotion.matches)celebration.reset()});
display();
