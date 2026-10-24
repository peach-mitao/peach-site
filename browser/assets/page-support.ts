import {resolveSiteLanguage} from './site-language.ts';
// 独立页面复用应用主题偏好；语言沿用官网保存的选择。
(()=>{
 const root=document.documentElement;
 try{const theme=JSON.parse(localStorage.getItem('peach.settings.v1')||'{}').theme;root.classList.toggle('dark',theme==='dark'||theme!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);if(theme==='light'||theme==='dark')root.dataset.theme=theme}catch{root.classList.toggle('dark',matchMedia('(prefers-color-scheme: dark)').matches)}
 const render=()=>{
  if(document.body.dataset.supportPage!=='404')return;
  const url=new URL(location.href);let saved:string|null=null;try{saved=localStorage.getItem('peach.site.locale')}catch{}
  const language=resolveSiteLanguage({path:url.pathname,explicit:url.searchParams.get('lang'),saved,languages:navigator.languages?.length?navigator.languages:[navigator.language]});
  root.lang=language==='zh'?'zh-CN':'en';
  const english=language==='en';
  const heading=document.querySelector<HTMLElement>('[data-not-found-title]'),detail=document.querySelector<HTMLElement>('[data-not-found-detail]'),home=document.querySelector<HTMLAnchorElement>('[data-not-found-home]'),label=home?.querySelector<HTMLElement>('span');
  if(english&&heading)heading.textContent='404';
  document.title=(heading?.textContent||'Page not found')+' · Peach';
  if(english&&detail)detail.textContent='This page may have moved, or the link may be incorrect.';
  if(home){home.href=english?document.body.dataset.supportHomeEn||'/':'/';home.lang=root.lang}
  if(english&&label)label.textContent='Back to home';
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',render,{once:true});else render();
})();
