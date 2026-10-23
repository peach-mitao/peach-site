import {createElement as h} from 'react';
import {createRoot} from 'react-dom/client';
import {Select} from '@cloudflare/kumo/components/select';
import {buttonVariants} from '@cloudflare/kumo/components/button';
import {GlobeIcon,DevicesIcon,FileIcon,TranslateIcon,CalendarBlankIcon,ClockCounterClockwiseIcon} from '@phosphor-icons/react';
import type {Icon} from '@phosphor-icons/react';

// 保留原表单值和编辑文案；浮层、定位、焦点与键盘行为由 Kumo / Base UI 管理。
export function enhanceSelects(){
 for(const link of document.querySelectorAll<HTMLAnchorElement>('.header-actions a'))link.className='button-link '+buttonVariants({variant:'secondary',size:'sm'});
 const controls=new Map<HTMLSelectElement,()=>void>();
 const icons:Record<string,Icon>={site:GlobeIcon,viewport:DevicesIcon,page:FileIcon,lang:TranslateIcon,days:CalendarBlankIcon,layout:ClockCounterClockwiseIcon};
 for(const select of document.querySelectorAll<HTMLSelectElement>('#filters select,#layout')){
  const container=document.createElement('span');container.className='select-island';
  const label=select.closest('label')!;
  const labelText=document.createElement('span');labelText.className='select-label';
  for(const node of [...label.childNodes])if(node!==select)labelText.append(node);
  label.prepend(labelText);label.append(container);label.classList.add('select-field');
  const root=createRoot(container),title=labelText.textContent?.trim()||'选择',Icon=icons[select.name||select.id]||FileIcon;
  const mapped=(value:string)=>value||'__all';
  const render=()=>{
   const items=[...select.options].map(option=>({value:mapped(option.value),label:option.label,disabled:option.disabled}));
   root.render(h(Select<string>,{
    placeholder:title,
    className:'cf-select',
    items,
    value:mapped(select.value),
    disabled:select.disabled||select.id==='layout'&&items.length===1&&select.options[0]?.value==='',
    align:select.name==='days'?'end':'start',
    sideOffset:6,
    renderValue:value=>h('span',{className:'select-value'},h(Icon,{size:16,'aria-hidden':true}),h('span',{className:'select-text'},items.find(item=>item.value===value)?.label||'选择')),
    onValueChange:value=>{
     if(value===null)return;
     select.value=value==='__all'?'':value;
     render();select.dispatchEvent(new Event('change',{bubbles:true}));
    },
   }));
  };
  controls.set(select,render);select.hidden=true;render();
 }
 return ()=>{for(const render of controls.values())render()};
}
