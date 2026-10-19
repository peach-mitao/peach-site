// 官网源码保存适配。点击、输入、取消、删除和响应解析由唯一共享核心处理。
(() => {
  const Core=globalThis.PeachCopyEditorCore,{raw}=window.__EDIT;
  const decode=s=>{const t=document.createElement('textarea');t.innerHTML=s;return t.value};
  const esc=s=>s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  const index=new Map(),walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),found=[];
  for(let node=walker.nextNode();node;node=walker.nextNode())if(!node.parentElement.closest('script,style'))found.push(node);
  let bad=-1;
  for(let i=0;i<Math.max(found.length,raw.length);i++){
    if(!found[i]||raw[i]===undefined||decode(raw[i])!==found[i].data){bad=i;break}
    index.set(found[i],i);
  }
  const css=document.createElement('style');css.dataset.copyEditor='';
  css.textContent=`
  [data-copy-draft],[data-copy-draft] *{color:#F4C0BD!important}
  .__eh{pointer-events:none;z-index:2147483000;outline:1.5px dashed #F08A8C;outline-offset:3px;border-radius:4px;display:none}
  .__ee{outline:2px solid #F08A8C;outline-offset:3px;border-radius:3px;background:rgba(240,138,140,.14);user-select:text;cursor:text}
  .__ei{z-index:2147483001;padding:2px 6px;border:0;border-radius:4px;outline:2px solid #F08A8C;background:#141518;color:#fff}
  .__eb{position:fixed;left:16px;bottom:16px;z-index:2147483002;display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:8px 14px;border-radius:10px;max-width:calc(100vw - 32px);box-sizing:border-box;font:13px/1.4 system-ui,"Microsoft YaHei",sans-serif;color:#C9CDD3;background:rgba(17,18,20,.94);border:1px solid #ffffff1f;box-shadow:0 8px 30px #0006}
  .__eb b{color:#fff}.__eb .ok{color:#7BD88F}.__eb .err{color:#FF8A80}.__eb .st{overflow-wrap:anywhere}
  .__eb button{font:inherit;color:inherit;border:0;background:transparent;cursor:pointer;text-decoration:underline}
  `;document.head.append(css);
  const highlight=document.createElement('div');highlight.className='__eh';
  const bar=document.createElement('div');bar.className='__eb';bar.dataset.copyEditor='';
  bar.innerHTML='<b>改字模式</b><span>点文字编辑，切换照常；Alt+点击改控件文字；回车保存，Esc 取消</span><span class="st" role="status"></span>';
  const status=bar.querySelector('.st'),say=(message,tone='')=>{status.textContent=message;status.className='st '+tone};
  let active=true,editor;
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='暂停编辑';
  toggle.onclick=()=>{if(editor.busy)return;editor.commit();active=!active;editor.hideHighlight();toggle.textContent=active?'暂停编辑':'继续编辑'};
  bar.append(toggle);document.body.append(highlight,bar);
  function patchText(patch){
    if(!patch)return;
    const {start,deleteCount,raw:inserted}=patch;raw.splice(start,deleteCount,...inserted);
    for(const [node,i] of index){
      if(i>=start+deleteCount)index.set(node,i+inserted.length-deleteCount);
      else if(i>=start)index.delete(node);
    }
  }
  editor=Core.create({highlight,inlineClass:'__ee',inputClass:'__ei',skip:'#live .mk,.media-01',
    isActive:()=>active,onStatus:say,onBusy:value=>bar.setAttribute('aria-busy',String(value)),
    resolve(node){
      const element=node.parentElement,field=element.closest('[data-copy-key]');
      const multiline=!!element.closest('pre,code');
      if(field)return {kind:'copy',key:field.dataset.copyKey,multiline};
      const kind=element.closest('#stage-say')?'say':element.closest('#dock-label')?'label':null;
      if(kind)return {kind,tab:document.querySelector('.dock [aria-selected="true"]'),sub:!!element.closest('.sub')};
      return index.has(node)?{kind:'text',index:index.get(node),multiline}:null;
    },
    async save(edit,text){
      let url,body;
      if(edit.kind==='copy'){
        const overrides=JSON.parse(document.body.dataset.copyOverrides||'{}');
        url='/__edit/copy';body={key:edit.key,before:Object.hasOwn(overrides,edit.key)?overrides[edit.key]:'',text};
      }else if(edit.kind==='text'){
        url='/__edit/text';body={i:edit.index,raw:raw[edit.index],text};
      }else{
        const tab=edit.tab;url='/__edit/tab';
        if(edit.kind==='label')body={k:tab.dataset.k,oldLabel:tab.dataset.label,label:text};
        else{
          const template=document.createElement('template');template.innerHTML=tab.dataset.say;
          const oldTitle=template.content.querySelector('b')?.textContent||'',oldSub=template.content.querySelector('.sub')?.textContent||'';
          body={k:tab.dataset.k,oldTitle,oldSub,title:edit.sub?oldTitle:text,sub:edit.sub?text:oldSub};
        }
      }
      const result=await Core.readJson(await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
      return {...result,payload:body,text,remove:edit.kind==='text'&&result.raw==='',message:text?'已保存修改':'已删除文字'};
    },
    onSaved(edit,result){
      if(edit.kind==='copy'){
        document.body.dataset.copyOverrides=JSON.stringify(result.overrides);dispatchEvent(new Event('peach:copy-saved'));
      }else if(edit.kind==='text'){
        if(result.raw===''){
          raw.splice(edit.index,1);index.delete(edit.node);
          for(const [node,i] of index)if(i>edit.index)index.set(node,i-1);
        }else raw[edit.index]=result.raw;
      }else{
        patchText(result.textPatch);const tab=edit.tab,body=result.payload;
        if(edit.kind==='label'){tab.dataset.label=result.text;tab.setAttribute('aria-label',result.text)}
        else tab.dataset.say=`<b>${esc(body.title)}</b>`+(body.sub?`<span class="sub">${esc(body.sub)}</span>`:'');
      }
    },
  });
  if(bad>=0)say(`第 ${bad} 段起和源文件不一致，请刷新后编辑`,'err');
})();
