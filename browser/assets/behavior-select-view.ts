import {createElement as h} from 'react';
import {Select} from '@cloudflare/kumo/components/select';
import {buttonVariants} from '@cloudflare/kumo/components/button';
import {GlobeIcon,DevicesIcon,FileIcon,TranslateIcon,CalendarBlankIcon,ClockCounterClockwiseIcon} from '@phosphor-icons/react';
import type {Icon} from '@phosphor-icons/react';
import type {SelectState} from './behavior-select-state.ts';

const icons:Record<string,Icon>={site:GlobeIcon,viewport:DevicesIcon,page:FileIcon,lang:TranslateIcon,days:CalendarBlankIcon,layout:ClockCounterClockwiseIcon};
export const headerButtonClass='button-link '+buttonVariants({variant:'secondary',size:'sm'});
export function selectView(state:SelectState,onChange?:(value:string)=>void){
 const items=state.items.map(item=>({...item,value:item.value||'__all'})),Icon=icons[state.name||state.id]||FileIcon;
 return h(Select<string>,{
  placeholder:state.title,className:'cf-select',items,value:state.value||'__all',
  disabled:state.disabled||state.id==='layout'&&items.length===1&&items[0]?.value==='__all',
  align:state.name==='days'?'end':'start',sideOffset:6,
  renderValue:value=>h('span',{className:'select-value'},h(Icon,{size:16,'aria-hidden':true}),h('span',{className:'select-text'},items.find(item=>item.value===value)?.label||'选择')),
  onValueChange:value=>{if(value!==null)onChange?.(value==='__all'?'':value)},
 });
}
