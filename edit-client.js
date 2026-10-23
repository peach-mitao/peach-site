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
  .__eb button:disabled{opacity:.4;cursor:default;text-decoration:none}
  `;document.head.append(css);
  const highlight=document.createElement('div');highlight.className='__eh';
  const bar=document.createElement('div');bar.className='__eb';bar.dataset.copyEditor='';
  bar.innerHTML='<b>改字模式</b><span>点文字编辑，切换照常；Alt+点击改控件文字；回车保存，Esc 取消</span><span class="st" role="status"></span>';
  const status=bar.querySelector('.st'),say=(message,tone='')=>{status.textContent=message;status.className='st '+tone};
  let active=true,editor,history=window.__EDIT.history,historyBusy=false;
  const undo=document.createElement('button'),redo=document.createElement('button');
  undo.type=redo.type='button';undo.textContent='撤销';redo.textContent='重做';
  undo.title='撤销上次保存（Ctrl+Z / ⌘Z）';redo.title='重做（Ctrl+Shift+Z / ⌘⇧Z）';
  const controls=()=>{undo.disabled=historyBusy||!!editor?.busy||!history?.undoCount;redo.disabled=historyBusy||!!editor?.busy||!history?.redoCount};
  async function travel(direction){
    if(historyBusy||editor.busy)return;
    await editor.commit();
    if(!(direction==='undo'?history?.undoCount:history?.redoCount))return;
    historyBusy=true;controls();say(direction==='undo'?'撤销中…':'重做中…');
    try{
      const result=await Core.readJson(await fetch('/__edit/'+direction,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({revision:history.revision})}));
      history=result.history;
      try{sessionStorage.setItem('peach.edit.view',JSON.stringify({scrollY,dialog:!!document.querySelector('[data-mac-help-dialog][open]'),open:[...document.querySelectorAll('#faq details')].map((el,i)=>el.open?i:-1).filter(i=>i>=0),message:direction==='undo'?'已撤销上次保存':'已重做上次保存'}))}catch{}
      location.reload();
    }catch(error){say(error.message,'err');historyBusy=false;controls()}
  }
  undo.onclick=()=>travel('undo');redo.onclick=()=>travel('redo');
  const toggle=document.createElement('button');toggle.type='button';toggle.textContent='暂停编辑';
  toggle.onclick=()=>{if(editor.busy)return;editor.commit();active=!active;editor.hideHighlight();toggle.textContent=active?'暂停编辑':'继续编辑'};
  bar.append(undo,redo,toggle);document.body.append(highlight,bar);controls();
  // 原生弹窗的顶层隔离外部控件，工具条随弹窗进入同一层。
  const placeToolbar=()=>{const host=document.querySelector('dialog[open]')||document.body;host.append(highlight,bar)};
  document.querySelectorAll('dialog').forEach(dialog=>new MutationObserver(placeToolbar).observe(dialog,{attributes:true,attributeFilter:['open']}));
  document.addEventListener('keydown',event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey||event.target.closest?.('input,textarea,[contenteditable="true"]')||editor?.editing)return;
    const key=event.key.toLowerCase(),direction=key==='z'?(event.shiftKey?'redo':'undo'):key==='y'?'redo':null;
    if(direction){event.preventDefault();void travel(direction)}
  },true);
  function patchText(patch){
    if(!patch)return;
    const {start,deleteCount,raw:inserted}=patch;raw.splice(start,deleteCount,...inserted);
    for(const [node,i] of index){
      if(i>=start+deleteCount)index.set(node,i+inserted.length-deleteCount);
      else if(i>=start)index.delete(node);
    }
  }
  function textGroup(node){
    const element=node.parentElement.closest('.sub,p,h1,h2,h3,h4,li');
    if(!element||element.closest('#stage-say,[data-copy-key]'))return null;
    const children=[...element.querySelectorAll('*')];
    if(children.some(child=>!['SPAN','CODE','B','STRONG','EM','I','SMALL','S','MARK'].includes(child.tagName)
      || !['inline','inline-block'].includes(getComputedStyle(child).display)
      || child.matches('[id],[data-copy-key],[data-copy-interact],[onclick]')))return null;
    const nodes=[],walker=document.createTreeWalker(element,NodeFilter.SHOW_TEXT);
    for(let part=walker.nextNode();part;part=walker.nextNode()){
      if(!index.has(part))return null;
      nodes.push(part);
    }
    return nodes.length?{kind:'block',element,nodes,index:index.get(nodes[0]),multiline:false}:null;
  }
  editor=Core.create({highlight,inlineClass:'__ee',inputClass:'__ei',skip:'#live .mk,.media-01',
    isActive:()=>active&&!historyBusy,onStatus:say,onBusy:value=>{bar.setAttribute('aria-busy',String(value));controls()},
    resolve(node){
      const element=node.parentElement,field=element.closest('[data-copy-key]');
      const multiline=!!element.closest('pre,code');
      if(field)return {kind:'copy',key:field.dataset.copyKey,multiline};
      const kind=element.closest('#stage-say')?'say':element.closest('#dock-label')?'label':null;
      if(kind)return {kind,tab:document.querySelector('.dock [aria-selected="true"]'),sub:!!element.closest('.sub')};
      const group=textGroup(node);if(group)return group;
      return index.has(node)?{kind:'text',index:index.get(node),multiline}:null;
    },
    async save(edit,text){
      let url,body;
      if(edit.kind==='copy'){
        const overrides=JSON.parse(document.body.dataset.copyOverrides||'{}');
        url='/__edit/copy';body={key:edit.key,before:Object.hasOwn(overrides,edit.key)?overrides[edit.key]:'',text};
      }else if(edit.kind==='block'){
        url='/__edit/block';body={i:edit.index,tag:edit.element.tagName.toLowerCase(),
          raw:edit.nodes.map(node=>raw[index.get(node)]),
          parts:Core.replaceTextParts(edit.parts,edit.lead+text+edit.trail)};
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
      body.revision=history.revision;
      const result=await Core.readJson(await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
      return {...result,payload:body,text,remove:edit.kind==='text'&&result.raw==='',message:text?'已保存修改':'已删除文字'};
    },
    onSaved(edit,result){
      history=result.history;controls();
      if(edit.kind==='copy'){
        document.body.dataset.copyOverrides=JSON.stringify(result.overrides);dispatchEvent(new Event('peach:copy-saved'));
      }else if(edit.kind==='block'){
        patchText(result.textPatch);
        const nodes=[],walker=document.createTreeWalker(edit.element,NodeFilter.SHOW_TEXT);
        for(let node=walker.nextNode();node;node=walker.nextNode())nodes.push(node);
        if(nodes.length!==result.textPatch.raw.length||nodes.some((node,i)=>node.data!==decode(result.textPatch.raw[i])))
          throw Error('当前段落与源文件不一致，请刷新后编辑');
        nodes.forEach((node,i)=>index.set(node,result.textPatch.start+i));
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
  try{
    const view=JSON.parse(sessionStorage.getItem('peach.edit.view'));sessionStorage.removeItem('peach.edit.view');
    if(view&&bad<0)addEventListener('load',()=>{
      document.querySelectorAll('#faq details').forEach((el,i)=>{el.open=view.open?.includes(i)??false});
      if(view.dialog)document.querySelector('[data-mac-help-dialog]')?.showModal();
      requestAnimationFrame(()=>scrollTo({top:view.scrollY,behavior:'instant'}));say(view.message,'ok');
    },{once:true});
  }catch{}
})();
