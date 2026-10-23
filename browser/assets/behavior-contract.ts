// 两站共用的行为协议；只传功能标识和位置，不传页面文字、输入值或完整 URL。
export const BEHAVIOR_VERSION = 1;
export type Site = 'site'|'demo';
export type Kind = 'page'|'exposure'|'click'|'navigate'|'scroll'|'leave'|'unmapped';
export type Viewport = 'mobile'|'tablet'|'desktop';
export interface Rule {id:string;label:string;selector:string;text?:string;textPrefix?:string;required?:boolean;region?:boolean}
export const interactiveSelector='a[href],button,summary,[role="button"],[role="tab"],input:not([type="hidden"]),select,textarea';
export interface Event {
 id:string;view:string;tab:string;at:number;seq:number;site:Site;page:string;layout:string;
 viewport:Viewport;width:number;height:number;lang:string;state:string;kind:Kind;target:string;slot:number;
 x:number;y:number;px:number;py:number;destination:string;referrer:string;utm:string;duration:number;
}
export interface Batch {version:1;session:string;events:Event[]}
export interface StartOptions {site:Site;layout:string;endpoint:string;rules:Rule[];preview?:boolean;state?:()=>string}
export interface Box {target:string;slot:number;x:number;y:number;width:number;height:number}
export interface Layout {site:Site;version:string;page:string;viewport:Viewport;state:string;lang:string;image:string;width:number;height:number;boxes:Box[];created:number}
export const ID = /^[a-f0-9]{32}$/;
export const KEY = /^[a-z][a-z0-9._:-]{0,79}$/;
export function viewport(width:number):Viewport{return width<640?'mobile':width<1024?'tablet':'desktop'}
export function pageKey(site:Site,path:string):string {
 if(site==='site')return path.startsWith('/en/copyright')?'/en/copyright/':path.startsWith('/copyright')?'/copyright/':path==='/en/'||path==='/en'?'/en/':'/';
 const clean=path.replace(/\/$/,'')||'/';
 if(/^\/(assets|works|performers|creators|studios|agencies|tags|series|posts)\/[^/]+$/.test(clean))return clean.replace(/[^/]+$/,':id');
 return /^\/(?:[a-z-]+\/)*[a-z-]*$/.test(clean)&&clean.length<80?clean:'/other';
}
export function destination(url:URL):string {
 if(url.hostname==='media.peach.video'||url.hostname==='downloads.peach.video'||/\.(exe|zip|dmg)$/i.test(url.pathname))return 'download';
 if(url.hostname==='demo.peach.video')return 'demo:'+pageKey('demo',url.pathname);
 if(url.hostname==='peach.video')return 'site:'+pageKey('site',url.pathname);
 if(url.hostname==='github.com')return 'external:github';
 if(url.hostname==='t.me')return 'external:telegram';
 if(url.hostname==='x.com'||url.hostname==='twitter.com')return 'external:x';
 return 'external:other';
}
