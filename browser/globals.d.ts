interface UserAgentHints {platform?:string;platformVersion?:string;architecture?:string;bitness?:string}
interface Navigator {readonly userAgentData?:UserAgentHints&{getHighEntropyValues?(keys:string[]):Promise<UserAgentHints>}}
interface EditHistory {revision:string;undoCount:number;redoCount:number}
interface Window {__EDIT:{raw:string[];port:number;history:EditHistory;locale?:string;translationKeys?:Record<number,string>};PEACH_ENTRY_REFERRER?:string;PEACH_LOCALE_REDIRECTING?:boolean}
declare var PEACH_I18N:Record<string,string>|undefined;
interface CopyEditor {busy:boolean;editing:boolean;commit(cancel?:boolean):Promise<unknown>|void;hideHighlight():void}
declare var PeachCopyToolbar:{create():{host:HTMLElement;bar:HTMLElement;status:HTMLElement;button(label:string,action:()=>unknown):HTMLButtonElement;say(message:string|null,tone?:string):void;setActive(active:boolean):void}};
declare module '*.css' {const content:string;export default content}
// 共享编辑器的适配协议；各字段由 resolve 与编辑核心共同填充。
interface CopyEdit {node:Text;original:string;kind:string;key:string;index:number;element:HTMLElement;nodes:Text[];parts:string[];lead:string;trail:string;tab:HTMLElement;sub:boolean}
interface CopyEditorOptions {highlight:HTMLElement;inlineClass?:string;inputClass?:string;skip?:string;isActive():boolean;onStatus(message:string,tone?:string):void;onBusy?(busy:boolean):void;onSaved?(edit:CopyEdit,result:any):void;resolve(node:Text):object|null;save(edit:CopyEdit,text:string):object|Promise<object>}
declare var PeachCopyEditorCore:{create(options:CopyEditorOptions):CopyEditor;applyDrafts(root:Node,edits:Record<string,string>,originals:WeakMap<Text,string>):void;replaceTextParts(parts:string[],text:string):string[];readJson(response:Response):Promise<{history:EditHistory;patch?:{start:number;deleteCount:number;raw:string[]};text?:string;[key:string]:unknown}>};
interface HTMLVideoElement {webkitPreservesPitch?:boolean;webkitEnterFullscreen?():void;webkitPresentationMode?:string;webkitSetPresentationMode?(mode:string):void;webkitSupportsPresentationMode?(mode:string):boolean}
interface Window {media01:(scope?:Document|HTMLElement)=>void;PEACH_I18N?:Record<string,string>}
interface Window {PeachBehavior?:{flush():Promise<void>;mark():void;stop():void;context():{site:string;version:string;page:string;viewport:string;state:string;lang:string};coverage():{tag:string;attributes:string[]}[]}}
declare module '*sticker-forge.es.js' {export function createSticker(box:HTMLElement,options:object):Promise<{reappear():void;reset():void;setOptions(options:object):void;getState():{dragging:boolean;progress:number};setPeelProgress(progress:number,motion:object):void}>}
