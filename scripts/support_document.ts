import {dashboardMarkup} from './render_dashboard_markup.ts';
import type {supportRenderer} from './render_support_markup.ts';
type Renderer=Awaited<ReturnType<typeof supportRenderer>>;

export function supportDocument(kind:'privacy'|'dashboard',source:string,renderer:Renderer){
 if(kind==='dashboard')return dashboardMarkup(source,renderer);
 const newline=source.includes('\r\n')?'\r\n':'\n';
 const templates=['zh','en'].flatMap(language=>[false,true].map(off=>`<template data-privacy-controls="${language}-${off?'off':'allowed'}">${renderer.renderPrivacy(off,language==='en')}</template>`)).join(newline);
 return source.replace('<!--PRIVACY_CONTROLS-->',renderer.renderPrivacy(false,false)).replace('<!--PRIVACY_TEMPLATES-->',templates);
}

export function supportSource(kind:'privacy'|'dashboard',html:string,renderer:Renderer){
 if(kind==='privacy'){
  const newline=html.includes('\r\n')?'\r\n':'\n';
  const start=html.indexOf('<div id="privacy-controls"'),end=html.indexOf(newline+'</article>',start);
  if(start<0||end<0)throw Error('统计偏好主体结构已改变，请撤销后重试');
  html=html.slice(0,start)+'<div id="privacy-controls" class="boardui-root"><!--PRIVACY_CONTROLS--></div>'+html.slice(end);
  const templates=html.indexOf('<template data-privacy-controls='),script=html.indexOf('<script>document.dispatchEvent',templates);
  if(templates<0||script<0)throw Error('统计偏好预览结构未取得，请刷新后重试');
  return html.slice(0,templates)+'<!--PRIVACY_TEMPLATES-->'+newline+html.slice(script);
 }
 return html.replaceAll(`class="${renderer.headerButtonClass}"`,'class="button-link"').replace(/<label class="select-field"><span class="select-label">([^<]+)<\/span>(<select\b[\s\S]*?<\/select>)<span class="select-island">[\s\S]*?<\/span><\/label>/g,(_match,title:string,select:string)=>`<label>${title}${select.replace(' hidden>','>')}</label>`);
}
