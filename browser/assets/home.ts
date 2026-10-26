interface MockContext {$:(selector:string)=>HTMLElement;$$:(selector:string)=>HTMLElement[];sleep(ms:number):Promise<void>;down(on:boolean):void;move(el:HTMLElement,fx?:number,fy?:number,fixed?:number):Promise<void>;click(el:HTMLElement,fx?:number,fy?:number):Promise<void>;type(el:HTMLElement,text:string):Promise<void>;count(el:HTMLElement,to:number,ms?:number):Promise<void>;key(label:string,el:HTMLElement):void;remove(el:HTMLElement):Promise<void>}
import {revealHorizontal} from './horizontal-controls.ts';
const t=(text:string)=>window.PEACH_I18N?.[text]??text;
const shots=[...(document.querySelectorAll('#screen picture') as NodeListOf<HTMLElement>)];
const tabs=[...(document.querySelectorAll('.dock button') as NodeListOf<HTMLElement>)];
const label=document.getElementById('dock-label'),say=document.getElementById('stage-say');
const dock=document.querySelector<HTMLElement>('.dock')!,tour=document.querySelector<HTMLElement>('.tour')!;
const dockItems=document.querySelector<HTMLElement>('.dock-items')!;
const screen=document.getElementById('screen')!;
const scrollShot=(index:number,instant:boolean)=>{
  const target=shots[index].getBoundingClientRect(),viewport=screen.getBoundingClientRect();
  screen.scrollTo({left:target.left+screen.scrollLeft-viewport.left-screen.clientLeft,behavior:instant?'instant':'smooth'});
};
new ResizeObserver(()=>scrollShot(tabs.findIndex(tab=>tab.getAttribute('aria-selected')==='true'),true)).observe(screen);
// 原站 tooltip 位于选中按钮上方 10px，随按钮的缩放与布局过渡更新位置。
const placeLabel=()=>{
  const selected=tabs.find(tab=>tab.getAttribute('aria-selected')==='true')!;
  const target=selected.getBoundingClientRect(),container=dock.getBoundingClientRect();
  const width=label!.offsetWidth;
  const visible=dockItems.getBoundingClientRect();
  label!.style.visibility=target.right<=visible.left||target.left>=visible.right?'hidden':'visible';
  const left=Math.max(8,Math.min(document.documentElement.clientWidth-width-8,target.left+(target.width-width)/2));
  label!.style.transform=`translate3d(${left-container.left-dock.clientLeft}px,${target.top-container.top-dock.clientTop-label!.offsetHeight-10}px,0)`;
};
let labelFrame=0;
const followLabel=()=>{
  cancelAnimationFrame(labelFrame);
  const finish=performance.now()+220;
  const update=()=>{placeLabel();if(performance.now()<finish)labelFrame=requestAnimationFrame(update)};
  update();
};
requestAnimationFrame(placeLabel);
new ResizeObserver(()=>{revealHorizontal(dockItems,tabs.find(tab=>tab.getAttribute('aria-selected')==='true')!,true);followLabel()}).observe(dockItems);
dockItems.addEventListener('scroll',followLabel,{passive:true});
document.fonts.ready.then(followLabel);
const loadShot=(tab: HTMLElement)=>{
  const picture=shots.find(shot=>shot.dataset.k===tab.dataset.k);
  const source=(picture!.querySelector('source') as HTMLSourceElement),img=(picture!.querySelector('img') as HTMLImageElement);
  if(source?.dataset.srcset&&!source.hasAttribute('srcset'))source.srcset=source.dataset.srcset;
  // srcset 先于 src 写入，浏览器直接按视口挑候选，不会先去取 4K 原图。
  if(img.dataset.srcset&&!img.hasAttribute('srcset'))img.srcset=img.dataset.srcset;
  if(img.dataset.src&&!img.hasAttribute('src'))img.src=img.dataset.src;
  return img;
};
let shotRequest=0,restoreTransition:(()=>void)|null=null;
tabs.forEach(tab=>tab.addEventListener('click',async event=>{
  const request=++shotRequest,selectedIndex=tabs.indexOf(tab);
  const currentIndex=tabs.findIndex(item=>item.getAttribute('aria-selected')==='true');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches,instant=reduced||event.detail===0;
  try{await loadShot(tab).decode()}catch{return}
  if(request!==shotRequest)return;
  restoreTransition?.();
  if(!instant&&currentIndex!==selectedIndex){
    // 滚动期间只排列已解码的当前图和目标图，不经过未加载画面。
    shots.forEach((shot,index)=>{shot.hidden=index!==currentIndex&&index!==selectedIndex});
    scrollShot(currentIndex,true);
    const restore=()=>{screen.removeEventListener('scrollend',restore);restoreTransition=null;shots.forEach(shot=>{shot.hidden=false});scrollShot(selectedIndex,true)};
    restoreTransition=restore;screen.addEventListener('scrollend',restore,{once:true});
  }
  tour.classList.toggle('is-instant',event.detail===0);
  tabs.forEach(t=>{t.setAttribute('aria-selected',String(t===tab));t.classList.toggle('utU0aa_active',t===tab)});
  shots.forEach((shot,index)=>shot.classList.toggle('on',index===selectedIndex));
  scrollShot(selectedIndex,instant);
  label!.textContent=tab.dataset.label!;
  revealHorizontal(dockItems,tab,instant);
  followLabel();
  say!.innerHTML=tab.dataset.say!;
}));
tabs.forEach(tab=>tab.addEventListener('mouseenter',()=>loadShot(tab)));
tabs.forEach(tab=>tab.addEventListener('focus',()=>loadShot(tab)));
// 移植原站模块 926753 的滚动、边界与分类底板逻辑；静态页面适配见参考记录。
{
  const reel=document.querySelector<HTMLElement>('.feature-reel')!;
  const cards=[...reel.querySelectorAll<HTMLElement>('.feature-card-wrapper')];
  const filters=[...document.querySelectorAll<HTMLButtonElement>('[data-feature-filter]')];
  const filterGroup=document.querySelector<HTMLElement>('.feature-filters')!,filterIndicator=document.createElement('span');
  filterIndicator.className='feature-filter-indicator _3Yq4tG_activeBackdrop';filterIndicator.setAttribute('aria-hidden','true');filterGroup.prepend(filterIndicator);
  const placeFilter=()=>{const selected=filters.find(button=>button.getAttribute('aria-pressed')==='true')!;
    const category=selected.parentElement!;
    filterIndicator.style.setProperty('--width',category.clientWidth+24+'px');
    filterIndicator.style.setProperty('--offset',category.offsetLeft+'px');
  };
  placeFilter();new ResizeObserver(placeFilter).observe(filterGroup);
  const previous=document.querySelector<HTMLButtonElement>('[data-feature-step="-1"]')!;
  const next=document.querySelector<HTMLButtonElement>('[data-feature-step="1"]')!;
  const firstCard=()=>cards.find(card=>!card.hidden);
  const sync=()=>{const first=firstCard();if(!first)return;previous.disabled=reel.scrollLeft===0;next.disabled=reel.scrollLeft+reel.clientWidth>=reel.scrollWidth-first.clientWidth};
  const move=(direction:number,instant:boolean)=>{
    const first=firstCard();if(!first)return;
    reel.scrollTo({left:reel.scrollLeft+first.clientWidth*direction,behavior:instant||matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  };
  document.querySelectorAll<HTMLButtonElement>('[data-feature-step]').forEach(button=>button.addEventListener('click',event=>move(Number(button.dataset.featureStep),event.detail===0)));
  reel.addEventListener('keydown',event=>{if(event.target!==reel||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();move(event.key==='ArrowRight'?1:-1,true)});
  filters.forEach(button=>button.addEventListener('click',event=>{
    if(button.getAttribute('aria-pressed')==='true')return;
    const instant=event.detail===0||matchMedia('(prefers-reduced-motion: reduce)').matches;
    reel.parentElement!.querySelectorAll('.feature-exit').forEach(node=>node.remove());
    if(!instant){
      // 原组件的 TransitionGroup 退出副本仅负责绘制，不参与编辑、焦点与埋点。
      const outgoing=reel.cloneNode(true) as HTMLElement;outgoing.removeAttribute('id');outgoing.inert=true;outgoing.setAttribute('aria-hidden','true');outgoing.classList.add('feature-exit','_3Yq4tG_reelExit');
      reel.parentElement!.append(outgoing);outgoing.scrollLeft=reel.scrollLeft;
      requestAnimationFrame(()=>outgoing.classList.add('_3Yq4tG_reelExitActive'));setTimeout(()=>outgoing.remove(),300);
    }
    filterGroup.classList.toggle('is-instant',event.detail===0);
    revealHorizontal(filterGroup.parentElement!,button.parentElement!,instant);
    filters.forEach(filter=>{filter.setAttribute('aria-pressed',String(filter===button));filter.parentElement!.classList.toggle('_3Yq4tG_active',filter===button)});
    placeFilter();
    let index=0;cards.forEach(card=>{card.hidden=button.dataset.featureFilter!=='all'&&card.dataset.category!==button.dataset.featureFilter;if(!card.hidden)card.style.setProperty('--delay',100+80*index+++'ms')});
    reel.scrollTo({left:0,behavior:'instant'});sync();
  }));
  reel.addEventListener('scroll',sync,{passive:true});new ResizeObserver(sync).observe(reel);sync();
}
// 导览截图在指向、聚焦或切换对应标签时加载。
const pageLoaded=document.readyState==='complete' ? Promise.resolve() : new Promise(resolve=>addEventListener('load',resolve,{once:true}));

// 手写使用原有 CSS 笔画时序；可见性事件控制暂停，完成的笔画不保留填充动画。
{
  const hello=document.querySelector<SVGSVGElement>('.hero .hello');
  if(hello){
    const paths=new Set(hello.querySelectorAll<SVGPathElement>('.pen'));
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let visible=false,pageActive=true,complete=false,watch:IntersectionObserver|undefined;
    const sync=()=>{if(!complete)hello.classList.toggle('is-paused',!visible||!pageActive||document.hidden)};
    const onHide=()=>{pageActive=false;sync()};
    const onShow=()=>{pageActive=true;sync()};
    const cleanup=()=>{
      complete=true;
      watch?.disconnect();
      hello.classList.remove('is-paused','is-writing');hello.dataset.helloComplete='true';
      hello.removeEventListener('animationend',onStrokeEnd);
      document.removeEventListener('visibilitychange',sync);
      window.removeEventListener('pagehide',onHide);window.removeEventListener('pageshow',onShow);
      reduced.removeEventListener('change',onMotion);
    };
    const finish=(path:SVGPathElement)=>{
      if(!paths.delete(path))return;
      path.classList.add('is-drawn');
      if(!paths.size)cleanup();
    };
    const onStrokeEnd=(event:AnimationEvent)=>{
      if(event.animationName==='hello-write'&&event.target instanceof SVGPathElement)finish(event.target);
    };
    const onMotion=()=>{
      if(reduced.matches){paths.forEach(path=>path.classList.add('is-drawn'));paths.clear();cleanup()}
    };
    if(reduced.matches)onMotion();
    else{
      hello.classList.add('is-paused');
      hello.addEventListener('animationend',onStrokeEnd);
      document.addEventListener('visibilitychange',sync);
      window.addEventListener('pagehide',onHide);window.addEventListener('pageshow',onShow);
      reduced.addEventListener('change',onMotion);
      watch=new IntersectionObserver(entries=>{
        visible=entries.some(entry=>entry.isIntersecting);sync();
      });
      watch.observe(hello);
      // 脚本晚于 CSS 加载时，已经写完的笔画同样进入静态状态。
      hello.getAnimations({subtree:true}).forEach(animation=>{
        const target=(animation.effect as KeyframeEffect|null)?.target;
        if((animation.playState==='finished'||animation.effect?.getComputedTiming().progress===1)&&target instanceof SVGPathElement)finish(target);
      });
    }
  }
}

(document.querySelectorAll('.copybtn') as NodeListOf<HTMLElement>).forEach(btn=>btn.addEventListener('click',async()=>{
  const text=document.getElementById(btn.dataset.copy!)!.textContent;
  try{await navigator.clipboard.writeText(text);btn.textContent=t('已复制')}catch{btn.textContent=t('复制失败')}
  setTimeout(()=>btn.textContent=t('复制'),1600);
}));

const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{rootMargin:'0px 0px -8% 0px'});
(document.querySelectorAll('.reveal') as NodeListOf<HTMLElement>).forEach(el=>io.observe(el));

// 常见问题：展开时高度展开、答案淡入，收起时高度收回；减少动态效果时直接切换。
if(!matchMedia('(prefers-reduced-motion: reduce)').matches)(document.querySelectorAll('.faq details') as NodeListOf<HTMLElement>).forEach(item=>{
  const summary=(item.querySelector('summary') as HTMLElement),answer=(item.querySelector('p') as HTMLElement);
  summary.addEventListener('click',event=>{
    event.preventDefault();
    item.getAnimations().forEach(animation=>animation.finish());
    const closed=summary.offsetHeight+item.offsetHeight-item.clientHeight,timing={duration:280,easing:'cubic-bezier(.2,.7,.2,1)'};
    const resize=(from:number,to:number,done?:()=>void)=>{item.style.overflow='hidden';
      item.animate({height:[`${from}px`,`${to}px`]},timing).onfinish=()=>{item.style.overflow='';done?.()}};
    if((item as HTMLDetailsElement).open)resize(item.offsetHeight,closed,()=>{(item as HTMLDetailsElement).open=false});
    else{(item as HTMLDetailsElement).open=true;resize(closed,item.offsetHeight);answer.animate({opacity:[0,1],transform:['translateY(-4px)','none']},timing)}
  });
});

// 语言菜单：点地球仪展开，点别处或按 Esc 收起。
{
  const menu=(document.querySelector('.lang-menu') as HTMLElement),button=(menu.querySelector('button') as HTMLButtonElement),list=(menu.querySelector('ul') as HTMLElement);
  let motion:Animation|null=null;
  const toggle=(open:boolean,instant=false)=>{
    if((button.getAttribute('aria-expanded')==='true')===open)return;
    const hidden=list.hidden,current=hidden?null:getComputedStyle(list);
    const from={opacity:current?.opacity??'0',transform:current?.transform??'translateY(-4px) scale(.95)'};
    motion?.cancel();button.setAttribute('aria-expanded',String(open));list.hidden=false;list.inert=!open;
    const trigger=button.getBoundingClientRect(),panel=list.getBoundingClientRect();
    list.style.transformOrigin=`${trigger.left+trigger.width/2-panel.left}px 0`;
    if(instant||matchMedia('(prefers-reduced-motion: reduce)').matches){list.hidden=!open;return}
    const animation=list.animate([from,{opacity:open?'1':'0',transform:open?'none':'translateY(-4px) scale(.95)'}],{duration:200,easing:getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim(),fill:'both'});
    motion=animation;animation.onfinish=()=>{if(motion!==animation)return;list.hidden=!open;animation.cancel();motion=null};
  };
  button.addEventListener('click',event=>toggle(button.getAttribute('aria-expanded')!=='true',event.detail===0));
  document.addEventListener('click',e=>{if(!menu.contains(e.target as Node|null))toggle(false)});
  menu.addEventListener('keydown',e=>{if(e.key==='Escape'&&!list.hidden){toggle(false,true);button.focus()}});
}

// 资料条：每行复制一份首尾相接。
(document.querySelectorAll('.marks-row') as NodeListOf<HTMLElement>).forEach(row=>[...row.children].forEach(el=>{
  const copy=el.cloneNode(true) as Element;copy.setAttribute('aria-hidden','true');row.append(copy);
}));

// 电影贴纸在宽屏与精确指针下加载。
if(matchMedia('(min-width:961px) and (pointer:fine)').matches)
  pageLoaded.then(()=>import('./stickers.ts')).then(module=>module.enhanceStickers()).catch(err=>console.warn('贴纸没有加载',err));

// 动效卡：每张卡里是一块 720×450 的简化界面，按卡宽整体缩放。脚本移光标、打字、点按钮，
// 播完淡出、复原 DOM 再来一轮。卡片进入画面才往下走，滚走或切走标签页就停在当前步骤。
{
  const CURSOR='<svg viewBox="0 0 24 24"><path d="M5 2.5v17.2l4.3-4.1 2.7 6.2 3-1.3-2.7-6.1h6z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  const SCENES: Record<string,(context:MockContext)=>Promise<void>>={
    async wall(k: MockContext){
      const s=k.$('.mk-wall'),target=k.$('.mk-wall-target');
      await k.sleep(800);
      await k.move(target,.65,.5);k.down(true);s.classList.add('dragged');
      await k.move(s,320/720,198/450,950);k.down(false);await k.sleep(700);
      await k.click(target);
      const focus=k.$('.mk-wall-focus');focus.style.transition='none';focus.style.transform='none';
      const a=target.getBoundingClientRect(),b=focus.getBoundingClientRect(),scale=b.width/focus.offsetWidth;
      const folded=`translate(${(a.left-b.left)/scale}px,${(a.top-b.top)/scale}px) scale(${a.width/b.width},${a.height/b.height})`;
      focus.style.transform=folded;focus.style.opacity='1';focus.getBoundingClientRect();focus.style.transition='';
      s.classList.add('open');focus.style.transform='none';await k.sleep(1800);
      await k.click(k.$('.mk-wall-play'));k.$('.mk-wall-number').textContent='仅提供演示';
      await k.sleep(1800);
      await k.click(k.$('.mk-wall-close'));focus.style.transform=folded;focus.style.opacity='0';s.classList.remove('open');await k.sleep(1300);
    },
    async feed(k: MockContext){
      await k.sleep(800);
      const cards=k.$$('.mk-f');
      const act=async(card: HTMLElement,tool: string,after: (card:HTMLElement)=>void)=>{
        await k.move(card,.5,.45);card.classList.add('hover');await k.sleep(400);
        await k.click((card.querySelector(tool) as HTMLElement));card.classList.remove('hover');after(card);await k.sleep(900)};
      await act(cards[0],'.t-read',(c)=>c.classList.add('isread'));
      await act(cards[1],'.t-read',(c)=>c.classList.add('isread'));
      await act(cards[2],'.t-skip',(c)=>c.classList.add('gone'));
      await k.sleep(1000);
    },
    async follow(k: MockContext){
      const s=k.$('.mk-s'),field=k.$('.mk-field'),find=k.$('.find'),add=k.$('.add');
      await k.sleep(700);
      await k.click(field,.3,.5);field.classList.add('focus');await k.sleep(250);
      field.classList.add('typing');await k.type(k.$('.mk-field .typed'),'Blender Studio');
      find.classList.remove('off');await k.sleep(350);
      await k.click(find);field.classList.remove('focus');s.classList.add('busy');
      await k.sleep(1500);s.classList.remove('busy');s.classList.add('found');
      await k.sleep(1100);
      const hits=k.$$('.mk-hit');
      await k.move(hits[0],.5,.5);await k.sleep(500);
      await k.click((hits[2].querySelector('.ck') as HTMLElement));hits[2].classList.add('off');add.textContent='添加选中（2）';
      await k.sleep(700);
      await k.click(add);
      s.classList.remove('found');field.classList.remove('typing');k.$('.mk-field .typed').textContent='';find.classList.add('off');
      k.$('.mk-toast').classList.add('on');
      const [who,src]=k.$$('.mk-stat .v');k.$('.mk-stat .of').textContent='/ 2';
      await Promise.all([k.count(who,1,500),k.count(src,2,500)]);
      await k.sleep(1400);k.$('.mk-toast').classList.remove('on');
      await k.sleep(1000);
    },
    async taste(k: MockContext){
      const s=k.$('.mk-s');
      await k.sleep(800);
      await k.click(k.$('.mk-read'));s.classList.add('busy');
      await k.sleep(1500);
      s.classList.remove('busy');s.classList.add('done');
      k.$$('.mk-stat em').forEach((em)=>{em.textContent=em.dataset.done!});
      await Promise.all(k.$$('.mk-stat .v').map((v)=>k.count(v,+v.dataset.to!,1100)));
      await k.sleep(500);
      await k.move(k.$('.mk-bars div'),.35,.5);await k.sleep(900);
      await k.move(k.$('.mk-radar .shape'),.5,.3);
      await k.sleep(2200);
    },
    // 光晕与强调色写在 .mk-theme 的变量上，注册过的颜色属性会自己渐变过去
    async theme(k: MockContext){
      const s=k.$('.mk-s');
      const pick=(el: HTMLElement)=>{(el.parentElement!.querySelectorAll('.sel') as NodeListOf<HTMLElement>).forEach((x)=>x.classList.remove('sel'));el.classList.add('sel')};
      const accent=(hex:string)=>{s.style.setProperty('--mk-acc',hex);pick(k.$(`.acc [data-a="${hex}"]`))};
      await k.sleep(800);
      await k.click(k.$('.t-sun'));s.classList.add('light');
      await k.sleep(1300);
      await k.click(k.$('.mk-pal'));s.classList.add('open');
      await k.sleep(700);
      await k.move(k.$('.p-plum'));await k.sleep(400);
      const peach=k.$('.p-peach');
      await k.click(peach);pick(peach);
      peach.dataset.g!.split(',').forEach((c,i)=>s.style.setProperty(`--mk-g${i+1}`,c));accent(peach.dataset.a!);
      await k.sleep(1300);
      await k.click(k.$('.a-violet'));accent('#8B5CF6');
      await k.sleep(1100);
      await k.click(k.$('.mk-tgrid'),.6,.35);s.classList.remove('open');
      await k.sleep(1000);
      await k.click(k.$('.t-moon'));s.classList.remove('light');
      await k.sleep(2000);
    },
  };

  function stage(card: HTMLElement,script: (context:MockContext)=>Promise<void>){
    const mock=(card.querySelector('.mk') as HTMLElement),win=(mock.querySelector('.mk-win') as HTMLElement),initial=win.innerHTML;
    const cursor=document.createElement('div');cursor.className='mk-cursor';cursor.innerHTML=CURSOR;mock.append(cursor);
    let at={x:560,y:380},seen=false,wake: (()=>void)|null=null;
    const playing=()=>seen&&!document.hidden;
    const gate=async()=>{while(!playing())await new Promise<void>(r=>{wake=r});wake=null};
    const sleep=async (ms:number)=>{await gate();await new Promise(r=>setTimeout(r,ms));await gate()};
    const scale=()=>mock.getBoundingClientRect().width/720;
    const point=(el: HTMLElement,fx=.5,fy=.5)=>{const m=mock.getBoundingClientRect(),r=el.getBoundingClientRect(),s=scale();
      return {x:(r.left-m.left+r.width*fx)/s,y:(r.top-m.top+r.height*fy)/s}};
    const k: MockContext={
      $:(sel)=>(win.querySelector(sel) as HTMLElement),$$:(sel)=>[...(win.querySelectorAll(sel) as NodeListOf<HTMLElement>)],sleep,
      down(on?: boolean|undefined){cursor.classList.toggle('down',on)},
      async move(el: any,fx?: number|undefined,fy?: number|undefined,fixed?: number|undefined){await gate();const p=point(el,fx,fy);
        const ms=fixed??Math.round(Math.min(950,Math.max(380,Math.hypot(p.x-at.x,p.y-at.y)*1.4)));
        cursor.style.transitionDuration=ms+'ms';cursor.style.transform=`translate(${p.x-5}px,${p.y-3}px)`;at=p;await sleep(ms+60)},
      async click(el: any,fx: any,fy: any){await k.move(el,fx,fy);k.down(true);
        const ripple=document.createElement('div');ripple.className='mk-ripple';ripple.style.left=at.x+'px';ripple.style.top=at.y+'px';
        mock.append(ripple);setTimeout(()=>ripple.remove(),550);await sleep(130);k.down(false)},
      async type(el: { textContent: any; },text: any){for(const ch of text){el.textContent+=ch;await sleep(170+Math.random()*120)}},
      // 数字从当前值涨到 to，先快后慢
      async count(el: { textContent: string; },to: number,ms=900){const from=+el.textContent.replace(/,/g,'')||0,n=Math.max(1,Math.round(ms/50));
        for(let i=1;i<=n;i++){el.textContent=Math.round(from+(to-from)*(1-(1-i/n)**3)).toLocaleString('en-US');await sleep(ms/n)}},
      key(label: string|null,el: any){const cap=document.createElement('div');cap.className='mk-key';cap.textContent=label;
        const p=point(el,.25,1);cap.style.left=p.x+'px';cap.style.top=(p.y+8)+'px';mock.append(cap);setTimeout(()=>cap.remove(),950)},
      // 收走一张卡：先淡出，再让后面的卡从原位滑到新位置。
      async remove(el: HTMLElement){el.classList.add('gone');await sleep(300);
        const rest=[...el.parentElement!.children].filter(c=>c!==el),before=rest.map(c=>c.getBoundingClientRect());
        el.remove();const s=scale();
        rest.forEach((c,i)=>{const a=before[i],b=c.getBoundingClientRect(),dx=(a.left-b.left)/s,dy=(a.top-b.top)/s;
          if(dx||dy)c.animate([{transform:`translate(${dx}px,${dy}px)`},{transform:'none'}],{duration:420,easing:'cubic-bezier(.2,.7,.2,1)'})});
        await sleep(420)},
    };
    (async()=>{for(;;){
      await script(k);
      win.classList.add('out');await sleep(380);
      win.innerHTML=initial;win.getBoundingClientRect();win.classList.remove('out');await sleep(500);
    }})();
    const resume=()=>{if(playing()&&wake)wake()};
    document.addEventListener('visibilitychange',resume);
    return (on:boolean)=>{seen=on;resume()};
  }

  const cards=[...(document.querySelectorAll('.live[data-mock]') as NodeListOf<HTMLElement>)];
  // 画框由 aspect-ratio 保留尺寸；缩放使用观察器的布局结果，不交错读写离屏卡片。
  const fit=new ResizeObserver(entries=>entries.forEach(({target,contentRect})=>{
    (target.querySelector('.mk') as HTMLElement).style.setProperty('--mk-s',String(contentRect.width/720));
  }));
  cards.forEach(card=>fit.observe((card.querySelector('.live-screen') as HTMLElement)));
  if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const players=new Map();
    const watch=new IntersectionObserver(entries=>entries.forEach(e=>{
      if(e.isIntersecting&&!players.has(e.target))players.set(e.target,stage(e.target as HTMLElement,SCENES[(e.target as HTMLElement).dataset.mock!]));
      players.get(e.target)?.(e.isIntersecting);
    }),{threshold:.35});
    cards.forEach(card=>watch.observe(card));
  }
}

document.querySelector('.dock')?.addEventListener('keydown',event=>{
  const key=(event as KeyboardEvent).key,index=tabs.indexOf(document.activeElement as HTMLElement);
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(key)||index<0)return;
  event.preventDefault();
  const next=key==='Home'?0:key==='End'?tabs.length-1:(index+(key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  tabs[next].focus();tabs[next].click();
});
