import type {Layout,Box} from './behavior-contract.ts';
import {enhanceSelects} from './behavior-controls.ts';
type Row=Record<string,string|number|null>;
interface Report {summary:Row;targets:Row[];points:Row[];paths:Row[];exits:Row[];sessions:Row[];sources:Row[];pages:Row[];layouts:Omit<Layout,'boxes'>[];funnel:Row}
const $=<T extends HTMLElement=HTMLElement>(selector:string)=>document.querySelector<T>(selector)!;
const form=$<HTMLFormElement>('#filters'),status=$('#status'),layout=$<HTMLSelectElement>('#layout');
const refreshControls=enhanceSelects();
let generation=0,data:Report|undefined;
const number=(value:unknown)=>Number(value||0).toLocaleString('zh-CN');
const empty=(parent:HTMLElement,title='暂无访问数据',description='接入后的访问会显示在这里。')=>{parent.replaceChildren();const box=document.createElement('div');box.className='empty';const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.innerHTML='<path d="M4 19h16M7 15V9m5 6V5m5 10v-4" fill="none" stroke="currentColor" stroke-width="1.5"/>';const heading=document.createElement('h3');heading.textContent=title;const p=document.createElement('p');p.textContent=description;box.append(icon,heading,p);parent.append(box)};
function table(parent:HTMLElement,headers:string[],rows:(string|number|HTMLElement)[][]){
 if(!rows.length){empty(parent);return}const table=document.createElement('table'),head=document.createElement('thead'),body=document.createElement('tbody'),hr=document.createElement('tr');
 for(const title of headers){const th=document.createElement('th');th.scope='col';th.textContent=title;hr.append(th)}head.append(hr);
 for(const row of rows){const tr=document.createElement('tr');for(const value of row){const td=document.createElement('td');if(value instanceof HTMLElement)td.append(value);else td.textContent=String(value);tr.append(td)}body.append(tr)}table.append(head,body);parent.replaceChildren(table);
}
const params=()=>{const query=new URLSearchParams([...new FormData(form)].map(([key,value])=>[key,String(value)]));query.set('section',document.querySelector('[role=tab][aria-selected=true]')?.getAttribute('aria-controls')||'heatmap');return query};
function options(select:HTMLSelectElement,rows:{value:string;label:string}[],placeholder:string){const value=select.value;select.replaceChildren(new Option(placeholder,''),...rows.map(row=>new Option(row.label,row.value)));if(rows.some(row=>row.value===value))select.value=value}
const displaySite=(site:unknown)=>site==='site'?'官网':'演示站';
const time=(at:unknown)=>new Date(Number(at)).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'});
const device=(value:string)=>({desktop:'桌面',mobile:'手机',tablet:'平板'}[value]||value);
const language=(value:string)=>value==='zh-CN'?'中文':value==='en'?'English':value;
const pageName=(value:string)=>({'/':'首页','/en/':'英文首页','/copyright/':'版权说明','/en/copyright/':'英文版权说明'}[value]||value);
const stateName=(value:string)=>({'platform.windows':'Windows','platform.macos':'macOS','platform.docker':'Docker','mac-help':'Mac 打开步骤',video:'介绍视频',default:'默认页面'}[value]||value);
async function fetchJSON<T>(url:string):Promise<T>{const response=await fetch(url,{credentials:'same-origin'});if(!response.ok)throw new Error(response.status===401?'登录已失效，请刷新后重新登录。':`读取失败（${response.status}），请稍后重试。`);return response.json() as Promise<T>}
async function load(){
 const token=++generation;status.textContent='正在读取…';status.classList.remove('error');form.setAttribute('aria-busy','true');
 ++detailGeneration;$('#session-detail').replaceChildren();$('#session-more').hidden=true;
 try{
  const result=await fetchJSON<Report>('/analytics/api/report?'+params());if(token!==generation)return;data=result;
  table($('#targets'),['区域 / 按钮','可见页面','点击页面','点击率','点击次数'],result.targets.map(row=>[`${row.target}${Number(row.slot)?' #'+(Number(row.slot)+1):''}`,number(row.exposures),number(row.clicked_views),Number(row.exposures)?(Number(row.clicked_views)/Number(row.exposures)*100).toFixed(1)+'%':'—',number(row.clicks)]));
  table($('#sources'),['来源','访问会话'],result.sources.map(row=>[String(row.referrer||'直接访问'),number(row.sessions)]));
  table($('#exits'),['页面','最后区域 / 操作','已结束会话'],result.exits.map(row=>[String(row.page),String(row.target||'—'),number(row.count)]));
  options(form.elements.namedItem('page') as HTMLSelectElement,result.pages.map(row=>({value:String(row.page),label:String(row.page)})),'全部页面');
  const filters=params(),layouts=result.layouts.filter(row=>(!filters.get('page')||row.page===filters.get('page'))&&(!filters.get('viewport')||row.viewport===filters.get('viewport'))&&(!filters.get('lang')||row.lang===filters.get('lang'))).sort((a,b)=>b.created-a.created);
  options(layout,layouts.map(row=>({value:[row.version,row.page,row.viewport,row.state,row.lang].join('|'),label:`${time(row.created)} · ${pageName(row.page)} · ${device(row.viewport)} · ${language(row.lang)} · ${stateName(row.state)}`})),'暂无页面截图');
  if(!layout.value&&layouts.length){const home=(row:Report['layouts'][number])=>row.page==='/'&&row.viewport==='desktop'&&row.lang==='zh-CN';const preferred=layouts.find(row=>home(row)&&row.state==='platform.windows')||layouts.find(row=>home(row)&&row.state==='default')||layouts[0]!;layout.value=[preferred.version,preferred.page,preferred.viewport,preferred.state,preferred.lang].join('|')}
  refreshControls();
  $('#funnel').replaceChildren(...[['home','访问官网'],['demo','进入演示'],['explore','操作演示'],['download','点击下载']].map(([key,label])=>{const box=document.createElement('div'),value=document.createElement('strong'),name=document.createElement('span');value.textContent=number(result.funnel[key!]);name.textContent=label!;box.append(value,name);return box}));
  const paths=$('#paths');paths.replaceChildren();if(!result.paths.length)empty(paths);else for(const row of result.paths){const item=document.createElement('div');item.className='panel';const route=document.createElement('span'),count=document.createElement('strong');route.textContent=`${row.node} → ${row.next}`;count.textContent=` ${number(row.count)} 次`;item.append(route,count);paths.append(item)}
  table($('#sessions'),['开始','页面','事件','会话'],result.sessions.map(row=>{const button=document.createElement('button');button.textContent=String(row.session).slice(0,8);button.addEventListener('click',()=>void session(String(row.session),button));return [time(row.start),number(row.pages),number(row.events),button]}));
  if(!$('#session-detail').children.length)empty($('#session-detail'),'选择一个会话','查看两站内按时间排列的操作。');
  status.textContent=`更新于 ${new Date().toLocaleTimeString('zh-CN')} · 最近 ${filters.get('days')} 天${Number(result.summary.unmapped)?' · '+number(result.summary.unmapped)+' 次未映射点击':''}`;
  await heatmap();
 }catch(error){if(token===generation){status.textContent=String((error as Error).message);status.classList.add('error')}}finally{if(token===generation)form.removeAttribute('aria-busy')}
}
let detailGeneration=0;
async function session(id:string,button:HTMLButtonElement,offset=0){
 const token=++detailGeneration;button.setAttribute('aria-busy','true');button.setAttribute('aria-disabled','true');
 if(!offset)$('#session-more').hidden=true;
 try{const query=new URLSearchParams({id,offset:String(offset),days:params().get('days')||'7'}),response=await fetch('/analytics/api/session?'+query,{credentials:'same-origin'});if(!response.ok)throw Error(`读取失败（${response.status}），请稍后重试。`);const rows=await response.json() as Row[];if(token!==detailGeneration)return;const list=offset?$('#session-detail').querySelector('ol')!:document.createElement('ol');list.className='timeline';for(const row of rows){const li=document.createElement('li');li.textContent=`${time(row.at)} · ${displaySite(row.site)} ${row.page} · ${row.kind} ${row.target||row.destination||''}`;list.append(li)}if(!offset)$('#session-detail').replaceChildren(list);const more=$<HTMLButtonElement>('#session-more'),next=response.headers.get('x-peach-next-offset');more.hidden=!next;more.onclick=()=>void session(id,more,Number(next))}catch(error){status.textContent=(error as Error).message}finally{button.removeAttribute('aria-busy');button.removeAttribute('aria-disabled')}
}
let heatGeneration=0;
async function heatmap(){
 const token=++heatGeneration,parent=$('#heat-image');$('#heat-status').textContent='';
 const selected=layout.value,row=data?.layouts.find(row=>[row.version,row.page,row.viewport,row.state,row.lang].join('|')===selected);
 if(!row){empty(parent,'暂无页面截图','发布对应页面的截图后，可查看该版本的点击分布。');return}
 const query=params();query.set('section','heatmap');for(const key of ['page','viewport','state','lang'] as const)query.set(key,row[key]);query.set('layout',row.version);
 try{
  const [result,selectedLayout]=await Promise.all([fetchJSON<Report>('/analytics/api/report?'+query),fetchJSON<{boxes:string}>('/analytics/api/layout?'+query)]);if(token!==heatGeneration)return;
  const boxes=JSON.parse(selectedLayout.boxes) as Box[],image=new Image();image.alt=`${pageName(row.page)} · ${device(row.viewport)}页面截图`;image.src='/analytics/image?'+query;
  image.onerror=()=>{if(token===heatGeneration)empty(parent,'截图未取得','请重新发布当前布局的参考截图。')};
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox',`0 0 ${row.width} ${row.height}`);svg.setAttribute('aria-label','点击位置');
  const maximum=Math.max(1,...result.points.map(point=>Number(point.hits)));let hits=0,omitted=0;
  for(const point of result.points){const box=boxes.find(box=>box.target===point.target&&box.slot===Number(point.slot)),count=Number(point.hits);if(!box){omitted+=count;continue}const x=box.x+Number(point.x)*box.width,y=box.y+Number(point.y)*box.height;if(x<0||x>=row.width||y<0||y>=row.height){omitted+=count;continue}const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx',String(x));circle.setAttribute('cy',String(y));circle.setAttribute('r',String(10+14*Math.sqrt(count/maximum)));circle.setAttribute('fill','#ff5a36');circle.setAttribute('fill-opacity',String(.25+.55*count/maximum));svg.append(circle);hits+=count}
  const wrapper=document.createElement('div');wrapper.className='heat';wrapper.style.maxWidth=row.width+'px';wrapper.append(image,svg);parent.replaceChildren(wrapper);$('#heat-status').textContent=`${pageName(row.page)} · ${device(row.viewport)} · ${language(row.lang)} · ${stateName(row.state)} · ${number(hits)} 次点击${omitted?' · '+number(omitted)+' 次位于参考图之外':''}`;
 }catch(error){if(token===heatGeneration)empty(parent,'无法读取热力图',(error as Error).message)}
}
form.addEventListener('submit',event=>event.preventDefault());form.addEventListener('change',()=>void load());layout.addEventListener('change',()=>void heatmap());
const tabs=[...document.querySelectorAll<HTMLButtonElement>('[role=tab]')];
function selectTab(tab:HTMLButtonElement){for(const item of tabs){const selected=item===tab;item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;$('#'+item.getAttribute('aria-controls')).hidden=!selected}}
for(const [index,tab] of tabs.entries()){tab.addEventListener('click',()=>{selectTab(tab);void load()});tab.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const next=tabs[event.key==='Home'?0:event.key==='End'?tabs.length-1:(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length]!;selectTab(next);next.focus();void load()})}
selectTab(tabs[0]!);void load();
