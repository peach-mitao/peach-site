import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {headerButtonClass,selectView} from './behavior-select-view.ts';

// 表单值沿用原 select；初始 HTML 与增强后的控件使用同一组件。
export function enhanceSelects(){
 for(const link of document.querySelectorAll<HTMLAnchorElement>('.header-actions a'))link.className=headerButtonClass;
 const controls=new Map<HTMLSelectElement,()=>void>();
 for(const select of document.querySelectorAll<HTMLSelectElement>('#filters select,#layout')){
  const label=select.closest('label')!,container=label.querySelector<HTMLElement>('.select-island')!,labelText=label.querySelector<HTMLElement>('.select-label')!;
  const root=createRoot(container),title=labelText.textContent?.trim()||'选择';
  const render=()=>root.render(selectView({
   name:select.name,id:select.id,title,value:select.value,disabled:select.disabled,
   items:[...select.options].map(option=>({value:option.value,label:option.label,disabled:option.disabled})),
  },value=>{select.value=value;render();select.dispatchEvent(new Event('change',{bubbles:true}))}));
  controls.set(select,render);flushSync(render);
 }
 return ()=>{for(const render of controls.values())render()};
}
