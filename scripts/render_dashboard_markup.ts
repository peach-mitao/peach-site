import type {SelectState} from '../browser/assets/behavior-select-state.ts';

export function dashboardMarkup(html:string,renderer:{renderSelect:(state:SelectState)=>string;headerButtonClass:string}){
 return html.replaceAll('class="button-link"',`class="${renderer.headerButtonClass}"`).replace(/<label>([^<]+)<select\b([^>]*)>([\s\S]*?)<\/select><\/label>/g,(_match,title:string,attributes:string,options:string)=>{
  const name=/\bname="([^"]*)"/.exec(attributes)?.[1]||'',id=/\bid="([^"]*)"/.exec(attributes)?.[1]||'';
  let value='';
  const items=[...options.matchAll(/<option\b([^>]*)>([^<]*)<\/option>/g)].map((option,index)=>{
   const own=/\bvalue="([^"]*)"/.exec(option[1])?.[1]||'';
   if(index===0||/\bselected\b/.test(option[1]))value=own;
   return {value:own,label:option[2],disabled:/\bdisabled\b/.test(option[1])};
  });
  const control=renderer.renderSelect({name,id,title,value,items,disabled:/\bdisabled\b/.test(attributes)});
  return `<label class="select-field"><span class="select-label">${title}</span><select${attributes} hidden>${options}</select><span class="select-island">${control}</span></label>`;
 });
}
