import {resolveSiteLanguage} from './site-language.ts';
import {privacyEnglish} from './privacy-copy.ts';
import {renderCopy} from './copy.ts';

document.addEventListener('peach:support-ready',()=>{
 const host=document.querySelector<HTMLElement>('#privacy-controls')!;
 let saved:string|null=null;try{saved=localStorage.getItem('peach.site.locale')}catch{}
 const language=resolveSiteLanguage({path:location.pathname,explicit:new URLSearchParams(location.search).get('lang'),saved,languages:navigator.languages});
 const off=/(?:^|;\s*)peach_analytics_off=1(?:;|$)/.test(document.cookie);
 const template=document.querySelector<HTMLTemplateElement>(`template[data-privacy-controls="${language}-${off?'off':'allowed'}"]`)!;
 host.replaceChildren(template.content.cloneNode(true));
 document.documentElement.lang=language==='zh'?'zh-CN':'en';
 for(const [id,text]of Object.entries(privacyEnglish)){
  const element=document.getElementById(id)!;
  renderCopy(element,`privacy.body.${id}.${language}`,language==='en'?text:element.textContent!);
 }
 for(const element of host.querySelectorAll<HTMLElement>('[data-copy-key]'))renderCopy(element,element.dataset.copyKey!,element.dataset.copyDefault!);
 document.title=document.querySelector('#privacy-title')!.textContent+' · Peach';
},{once:true});
