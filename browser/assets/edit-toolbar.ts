// 两站共用的文案工具条。按钮来自固定来源的 BoardUI；浮条几何复用应用 SelectionDock。
import {createElement, createRoot, flushSync, Button} from './boardui.ts';
import boardStyles from '../../site/assets/boardui.css';

function create() {
 const host=document.createElement('div');host.dataset.copyEditor='';host.dataset.copyToolbarHost='';host.style.display='contents';
 const shadow=host.attachShadow({mode:'open'}),theme=document.createElement('div'),scope=document.createElement('div');
 scope.className='peach-react';theme.append(scope);
 const style=document.createElement('style');
 style.textContent=boardStyles.replace(/:root\b/g,':host')+`
 .peach-react [data-selection-dock]{position:fixed;z-index:2147483647;bottom:var(--copy-toolbar-bottom,calc(max(22px,env(safe-area-inset-bottom)) + var(--copy-notice-clearance,var(--demo-notice-height,0px))));left:50%;display:flex;width:max-content;max-width:calc(100vw - 24px);padding:9px 11px;transform:translateX(-50%);flex-wrap:wrap;align-items:center;justify-content:center;gap:7px;border-radius:22px;backdrop-filter:var(--glass-optic,blur(22px)) saturate(145%);-webkit-backdrop-filter:var(--glass-optic,blur(22px)) saturate(145%)}
 [data-selection-dock]{background:var(--glass-fill,var(--color-background-secondary-default));color:var(--color-text-primary);box-shadow:inset 0 1px 0 var(--glass-rim,var(--color-border-button-default)),inset 1px 0 0 var(--glass-low,var(--color-border-button-default)),inset -1px 0 0 var(--glass-low,var(--color-border-button-default)),inset 0 -1px 0 var(--glass-low,var(--color-border-button-default)),var(--glass-shadow,var(--shadow-lg));font:var(--board-body,400 14px/20px var(--font-sans))}
 [data-copy-state]{box-sizing:content-box;width:5em;flex:none;padding:0 8px;white-space:nowrap;text-align:center;overflow:hidden;text-overflow:ellipsis}[data-copy-feedback]{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
 [data-copy-action]{display:contents}[data-copy-help]{position:fixed;inset:auto;margin:0;max-width:min(320px,calc(100vw - 32px));padding:12px 16px;border:1px solid var(--color-border-button-default);border-radius:var(--control-radius,10px);background:var(--color-background-primary-default);color:var(--color-text-primary);box-shadow:var(--shadow-lg);font:400 13px/20px var(--font-sans);white-space:pre-line}
 @media(max-width:600px){[data-copy-state]{flex-basis:100%;text-align:center}[data-selection-dock] button{min-height:36px}}
 @media(prefers-reduced-transparency:reduce),(prefers-contrast:more){[data-selection-dock]{background:var(--color-background-primary-default);backdrop-filter:none!important;-webkit-backdrop-filter:none!important}}
 `;
 shadow.append(style,theme);
 const bar=document.createElement('div');bar.dataset.copyBar='';bar.dataset.selectionDock='';bar.dataset.glassPane='';bar.setAttribute('role','group');bar.setAttribute('aria-label','文案编辑');
 const state=document.createElement('span');state.dataset.copyState='';state.textContent='改字模式';
 const status=document.createElement('span');status.dataset.copyFeedback='';status.setAttribute('role','status');status.setAttribute('aria-live','polite');bar.append(state);scope.append(bar);
 const syncTheme=()=>{const root=document.documentElement;theme.classList.toggle('dark',root.classList.contains('dark')||root.dataset.theme==='dark'||root.dataset.theme!=='light'&&(getComputedStyle(root).colorScheme==='dark'||matchMedia('(prefers-color-scheme: dark)').matches))};
 new MutationObserver(syncTheme).observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme']});syncTheme();
 const button=(label:string,action:()=>unknown)=>{
  const mount=document.createElement('span');mount.dataset.copyAction='';bar.insertBefore(mount,status.isConnected?status:null);
  let node!:HTMLButtonElement;
  flushSync(()=>createRoot(mount).render(createElement(Button,{variant:'secondary',size:'medium',ref:(value:HTMLButtonElement|null)=>{if(value)node=value},onClick:action},label)));
  return node;
 };
 const tip=document.createElement('div');tip.id='peach-copy-help';tip.dataset.copyHelp='';tip.setAttribute('role','tooltip');tip.popover='manual';
 tip.textContent='点击文字修改；切换、菜单和开关照常操作。\nAlt + 点击可修改控件文字。\nEnter 保存，Esc 取消。\n暂停编辑后可正常选择、复制文字。';scope.append(tip);
 const placeTip=()=>{const rect=help.getBoundingClientRect(),box=tip.getBoundingClientRect();tip.style.left=Math.max(16,Math.min(innerWidth-box.width-16,rect.left+rect.width/2-box.width/2))+'px';tip.style.top=Math.max(8,bar.getBoundingClientRect().top-box.height-12)+'px'};
 const hide=()=>{if(tip.matches(':popover-open'))tip.hidePopover()};
 const show=()=>{if(!tip.matches(':popover-open'))tip.showPopover();placeTip()};
 const help=button('帮助',show);help.setAttribute('aria-label','编辑使用说明');help.setAttribute('aria-describedby',tip.id);
 help.addEventListener('pointerenter',show);help.addEventListener('pointerleave',()=>{if(shadow.activeElement!==help)hide()});help.addEventListener('focus',show);help.addEventListener('blur',hide);
 document.addEventListener('keydown',event=>{if(event.key==='Escape')hide()});document.addEventListener('pointerdown',event=>{if(!event.composedPath().includes(help)&&!event.composedPath().includes(tip))hide()},true);window.addEventListener('resize',hide);document.addEventListener('scroll',hide,true);
 bar.append(status);
 const notice=document.querySelector<HTMLElement>('.site-notice');
 if(notice){
  const measureNotice=()=>host.style.setProperty('--copy-notice-clearance',Math.ceil(notice.getBoundingClientRect().height+(parseFloat(getComputedStyle(notice).bottom)||0))+'px');
  new ResizeObserver(measureNotice).observe(notice);window.addEventListener('resize',measureNotice);measureNotice();
 }
 // 普通文档为固定工具条保留可滚空间，底部导航可以完整滚出浮条覆盖区。
 if(!document.querySelector('[data-demo-notice]')){
  const space=document.createElement('div');space.dataset.copyEditor='';space.dataset.copyToolbarSpace='';space.setAttribute('aria-hidden','true');space.style.cssText='display:block;flex:none;width:1px;pointer-events:none';document.body.append(space);
  const measure=()=>{space.style.height=Math.ceil(bar.offsetHeight+(parseFloat(getComputedStyle(bar).bottom)||0)+16)+'px'};
  const observer=new ResizeObserver(measure);observer.observe(bar);if(notice)observer.observe(notice);window.addEventListener('resize',measure);requestAnimationFrame(measure);
 }
 let active=true;
 const say=(message:string|null,tone='')=>{
  status.textContent=message;status.dataset.tone=tone;state.title=message||'';
  state.textContent=!message?(active?'改字模式':'编辑已暂停'):tone==='err'?'保存失败':message.includes('Enter 保存')?'正在编辑':message.startsWith('已保存')?'已保存':message.startsWith('已删除')?'已删除':message==='已取消'?'已取消':message.includes('…')?'处理中':active?'改字模式':'编辑已暂停';
 };
 return {host,bar,status,button,say,setActive(value:boolean){active=value;say('')}};
}
Object.assign(globalThis,{PeachCopyToolbar:{create}});
