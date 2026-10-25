import {BEHAVIOR_VERSION,viewport,pageKey,destination,interactiveSelector,type StartOptions,type Event,type Kind,type Batch} from './behavior-contract.ts';
const cookie='peach_visit',optout='peach_analytics_off',idle=30*60*1000;
const random=()=>crypto.randomUUID().replaceAll('-','');
export function startBehavior(options:StartOptions){
 const local=['127.0.0.1','localhost'].includes(location.hostname),params=new URLSearchParams(location.search),capture=local&&params.has('behavior-capture');
 if((local&&!options.preview&&!capture)||(!local&&(navigator.webdriver||/headless|bot\b|crawl|spider/i.test(navigator.userAgent)))||params.has('edit')||params.has('heatmap')||location.pathname.startsWith('/analytics')||window.PEACH_LOCALE_REDIRECTING)return;
 const read=(key:string)=>document.cookie.split(';').map(v=>v.trim()).find(v=>v.startsWith(key+'='))?.slice(key.length+1)||'';
 const write=(value:string)=>{document.cookie=`${cookie}=${value}; Path=/; Max-Age=1800; SameSite=Lax${local?'':'; Secure; Domain=peach.video'}`};
 if(!capture&&read(optout)==='1')return;
 let sid='',last=0,view=random(),seq=0,route='',currentPage=pageKey(options.site,location.pathname),visibleAt=document.visibilityState==='visible'?performance.now():0,activeMs=0,lastRegion='',reached=0;
 const tab=random(),queue:{session:string;event:Event}[]=[],seen=new Set<string>(),observed=new Map<Element,string>(),timers=new Map<Element,ReturnType<typeof setTimeout>>();
 let flushTimer:ReturnType<typeof setTimeout>|undefined,stopped=capture,lastLeave='';
 const active=()=>Math.round(activeMs+(visibleAt?performance.now()-visibleAt:0));
 const state=()=>options.state?.()||'default';
 function session(){
  const now=Date.now(),shared=read(cookie),next=/^[a-f0-9]{32}$/.test(shared)?shared:!sid||now-last>idle?random():sid;
  const changed=!!sid&&next!==sid;sid=next;last=now;write(sid);return changed;
 }
 async function flush(){
  if(flushTimer){clearTimeout(flushTimer);flushTimer=undefined}
  if(!queue.length||stopped)return;
  if(read(optout)==='1'){queue.length=0;return}
  const session=queue[0]!.session;let count=0;while(count<40&&queue[count]?.session===session)count++;
  const body:Batch={version:BEHAVIOR_VERSION,session,events:queue.splice(0,count).map(row=>row.event)};
  // 队列有数据才发送；失败不写入持久存储，也不无限重试。
  try{await fetch(options.endpoint,{method:'POST',body:JSON.stringify(body),credentials:'include',keepalive:true,headers:{'content-type':'text/plain;charset=UTF-8'}})}catch{}
  if(queue.length&&!flushTimer)flushTimer=setTimeout(()=>void flush(),1000);
 }
 function emit(kind:Kind,target='',extra:Partial<Event>={}){
  if(stopped||read(optout)==='1')return;
  if(kind==='leave'&&Date.now()-last>idle)return;
  if(session()){
   view=random();seq=0;activeMs=0;visibleAt=document.visibilityState==='visible'?performance.now():0;seen.clear();
   if(kind!=='page')emit('page');
  }
  const duration=Math.min(86400e3,active());
  if(kind==='leave'){
   const signature=`${view}:${state()}:${target}:${duration}`;
   if(signature===lastLeave)return;
   lastLeave=signature;
  }
  if(queue.length>=120)queue.shift();
  queue.push({session:sid,event:{id:random(),view,tab,at:Date.now(),seq:seq++,site:options.site,page:currentPage,layout:options.layout,viewport:viewport(innerWidth),width:innerWidth,height:innerHeight,lang:document.documentElement.lang==='en'?'en':'zh-CN',state:state(),kind,target,slot:0,x:-1,y:-1,px:-1,py:-1,destination:'',referrer:'',utm:'',duration,...extra}});
  if(queue.length>=20)void flush();else if(!flushTimer)flushTimer=setTimeout(()=>void flush(),10000);
 }
 const observer=new IntersectionObserver(entries=>{for(const entry of entries){
  const element=entry.target as HTMLElement;
  if(timers.has(element)){clearTimeout(timers.get(element));timers.delete(element)}
  const enough=entry.isIntersecting&&entry.intersectionRect.height>=Math.min(entry.boundingClientRect.height*.5,innerHeight*.5)&&entry.intersectionRect.width>=Math.min(entry.boundingClientRect.width*.5,innerWidth*.5);
  if(!enough)continue;
  const surface=`${view}:${state()}`;
  timers.set(element,setTimeout(()=>{timers.delete(element);if(!element.isConnected||document.visibilityState!=='visible'||surface!==`${view}:${state()}`)return;const box=element.getBoundingClientRect(),hit=document.elementFromPoint((Math.max(0,box.left)+Math.min(innerWidth,box.right))/2,(Math.max(0,box.top)+Math.min(innerHeight,box.bottom))/2);if(!hit||!element.contains(hit))return;const key=`${surface}:${element.dataset.behaviorTarget}`;if(seen.has(key))return;seen.add(key);emit('exposure',element.dataset.behaviorTarget,{slot:Number(element.dataset.behaviorSlot)||0})},1000));
 }},{threshold:[0,.001,.005,.01,.025,.05,.1,.25,.5,.75,1]});
 function mark(){
  const matches=new Map<HTMLElement,{target:string;slot:number;region?:string}>();
  for(const rule of options.rules){
   [...document.querySelectorAll<HTMLElement>(rule.selector)].filter(element=>(rule.text===undefined||element.textContent?.trim()===rule.text)&&(rule.textPrefix===undefined||element.textContent?.trim().startsWith(rule.textPrefix))).forEach((element,slot)=>{
    if(element.closest('[data-behavior-ignore]'))return;
    matches.set(element,{target:rule.id,slot,region:rule.region?rule.id:matches.get(element)?.region});
   });
  }
  for(const [node] of observed){const element=node as HTMLElement;if(!element.isConnected||!matches.has(element)){observer.unobserve(element);observed.delete(element);clearTimeout(timers.get(element));timers.delete(element);delete element.dataset.behaviorTarget;delete element.dataset.behaviorSlot;delete element.dataset.behaviorRegion}}
  for(const [element,match] of matches){element.dataset.behaviorTarget=match.target;element.dataset.behaviorSlot=String(match.slot);if(match.region)element.dataset.behaviorRegion=match.region;else delete element.dataset.behaviorRegion;const surface=`${view}:${state()}:${match.target}`;if(observed.get(element)!==surface){observer.unobserve(element);observed.set(element,surface);observer.observe(element)}}
 }
 let scheduled=false;
 const copySelectors=options.rules.filter(rule=>rule.text!==undefined||rule.textPrefix!==undefined).map(rule=>rule.selector).join(',');
 const mutations=new MutationObserver(records=>{if(!records.some(record=>record.type==='attributes'||[...record.addedNodes,...record.removedNodes].some(node=>node instanceof Element)||Boolean(copySelectors&&(record.target instanceof Element?record.target:record.target.parentElement)?.closest(copySelectors)))||scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;mark()})});
 function enter(){
  const key=location.pathname+location.search+location.hash;if(key===route)return;
  if(route){emit('leave',lastRegion);void flush()}
  route=key;currentPage=pageKey(options.site,location.pathname);view=random();seq=0;activeMs=0;visibleAt=document.visibilityState==='visible'?performance.now():0;seen.clear();reached=0;lastRegion='';
  let referrer='';try{referrer=window.PEACH_ENTRY_REFERRER??(document.referrer?new URL(document.referrer).hostname:'')}catch{}
  const utm=(new URLSearchParams(location.search).get('utm_source')||'').match(/^[\w.-]{1,32}$/)?.[0]||'';
  emit('page','',{referrer,utm});mark();
 }
 for(const method of ['pushState','replaceState'] as const){const original=history[method].bind(history);history[method]=(data:unknown,unused:string,url?:string|URL|null)=>{original(data,unused,url);queueMicrotask(enter)}}
 addEventListener('popstate',enter);addEventListener('hashchange',enter);
 document.addEventListener('click',event=>{
  if(!(event.target instanceof Element)||event.target.closest('[data-behavior-ignore]'))return;
  const control=event.target.closest<HTMLElement>('[data-behavior-target]'),region=event.target.closest<HTMLElement>('[data-behavior-region]');
  const interactive=event.target.closest(interactiveSelector);
  const target=control?.dataset.behaviorTarget||'',slot=Number(control?.dataset.behaviorSlot)||0,box=control?.getBoundingClientRect();
  lastRegion=region?.dataset.behaviorRegion||lastRegion;
  if(target)emit('click',target,{slot,x:box?.width?Math.max(0,Math.min(1,(event.clientX-box.left)/box.width)):-1,y:box?.height?Math.max(0,Math.min(1,(event.clientY-box.top)/box.height)):-1,px:event.clientX/innerWidth,py:(event.clientY+scrollY)/Math.max(document.documentElement.scrollHeight,1)});
  if(interactive&&!interactive.hasAttribute('data-behavior-target'))emit('unmapped','unmapped');
  const link=event.target.closest<HTMLAnchorElement>('a[href]');
  if(link){const url=new URL(link.href,location.href);if(['http:','https:'].includes(url.protocol)){const next=destination(url);emit('navigate',target,{slot,destination:next==='download'?next:url.origin===location.origin?'page:'+pageKey(options.site,url.pathname):next});void flush()}}
 },true);
 addEventListener('scroll',()=>{const depth=Math.min(100,Math.floor((scrollY+innerHeight)/Math.max(document.documentElement.scrollHeight,1)*4)*25);if(depth>reached){reached=depth;emit('scroll','depth:'+depth)}},{passive:true});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'){if(visibleAt){activeMs+=performance.now()-visibleAt;visibleAt=0}emit('leave',lastRegion);void flush()}else{visibleAt=performance.now();mark()}});
 addEventListener('pagehide',()=>{emit('leave',lastRegion);void flush()});
 addEventListener('pageshow',event=>{if(event.persisted){route='';enter()}});
 const publicAPI={flush,mark,context:()=>({site:options.site,version:options.layout,page:currentPage,viewport:viewport(innerWidth),state:state(),lang:document.documentElement.lang==='en'?'en':'zh-CN'}),stop:()=>{stopped=true;observer.disconnect();mutations.disconnect();if(flushTimer)clearTimeout(flushTimer);for(const timer of timers.values())clearTimeout(timer);queue.length=0},coverage:()=>[...document.querySelectorAll<HTMLElement>(interactiveSelector)].filter(el=>el.checkVisibility()&&!el.closest('[data-behavior-ignore]')&&!el.dataset.behaviorTarget).map(el=>({tag:el.tagName,id:el.id,attributes:[...el.attributes].map(a=>a.name).filter(a=>a.startsWith('data-')).sort()}))};
 window.PeachBehavior=publicAPI;
 mutations.observe(document.documentElement,{subtree:true,childList:true,characterData:!!copySelectors,attributes:true,attributeFilter:['aria-expanded','aria-selected','aria-pressed','open','hidden']});enter();return publicAPI;
}
