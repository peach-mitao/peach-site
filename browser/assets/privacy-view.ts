import {createElement as h,Button,LinkButton,Note,Divider} from './boardui.js';
import {privacyLabels,privacyStatus} from './privacy-copy.js';

export function privacyView({off,english,onOptOut,onAllow}:{off:boolean;english:boolean;onOptOut?:()=>void;onAllow?:()=>void}){
 const locale=english?'en':'zh',labels=privacyLabels(english);
 const label=(name:keyof typeof labels)=>h('span',{'data-privacy-label':name,'data-copy-key':`privacy.action.${name}.${locale}`,'data-copy-default':labels[name]},labels[name]);
 const status=privacyStatus(english,off);
 const action=h('div',{className:'flex max-w-full flex-wrap gap-2'},
  h(Button,{id:'analytics-off',variant:'secondary',hidden:off,onClick:onOptOut,...{'data-copy-interact':''}},label('off')),
  h(Button,{id:'analytics-on',variant:'secondary',hidden:!off,onClick:onAllow,...{'data-copy-interact':''}},label('on')));
 return h('div',{className:'flex flex-col gap-6'},
  h(Note,{tone:'neutral',className:'privacy-state-note',action,children:h('span',{id:'preference',role:'status',className:off?'text-text-secondary':'text-notification-success-foreground','data-copy-key':`privacy.analytics.${off?'off':'allowed'}.${locale}`,'data-copy-default':status},status)}),
  h(Divider),
  h('nav',{className:'flex flex-wrap items-center justify-between gap-x-6 gap-y-2','aria-label':english?'Website links':'站点导航'},
   h(LinkButton,{id:'privacy-home',variant:'secondary',className:'py-2',href:english?'/en/':'/'},label('home')),
   h(LinkButton,{id:'privacy-demo',variant:'secondary',className:'py-2',href:'https://demo.peach.video/'},label('demo'))));
}
