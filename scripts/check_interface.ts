import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.argv[2] ?? 'http://127.0.0.1:8795/';
const browser = await chromium.launch();
try {
    for (const width of [390, 1440] as const)
        for (const language of ['zh-CN', 'en'] as const) {
            const page = await browser.newPage({ viewport: { width, height: 844 }, locale: language }), errors: string[] = [];
            page.on('pageerror', e => errors.push(e.message));
            await page.route('https://api.github.com/**', r => r.fulfill({ json: [] }));
            await page.route('**/releases.json', r => r.fulfill({ json: [] }));
            await page.route('https://img.shields.io/**', r => r.fulfill({ json: { message: 'v1.2.3' } }));
            try {
                await page.goto(new URL(language === 'en' ? '/en/' : '/', base).href, { waitUntil: 'networkidle' });
                assert.equal(await page.locator('html').getAttribute('lang'), language, '直接地址决定页面语言');
                assert.equal(await page.locator('.mk-cursor').count(), 0, '离屏卡片不创建播放光标');
                await page.locator('.lang-menu button').click();
                assert.equal(await page.locator('.lang-list').isVisible(), true);
                await page.mouse.move(0,0);
                const selected = await page.locator(`.lang-list a[lang="${language}"]`).evaluate(el => { const s = getComputedStyle(el, '::after'); return { content: s.content, width: s.width, mask: s.maskImage,background:getComputedStyle(el).backgroundColor }; });
                assert.equal(selected.width, '14px', '当前语言显示图形勾号');
                assert.match(selected.mask, /data:image\/svg/);
                assert.notEqual(selected.background,'rgba(0, 0, 0, 0)','当前语言保留选中背景');
                await page.keyboard.press('Escape');
                assert.equal(await page.locator('.lang-list').isVisible(), false);
                const navCopy=await page.locator('.nav [data-primary-download] span').innerText();
                assert.ok((language==='en'?['Download','Deploy']:['下载','部署']).includes(navCopy));
                assert.ok(await page.locator('.nav [data-primary-download]').getAttribute('aria-label'),'紧凑下载入口保留完整平台名称');
                assert.equal(await page.locator('.hero a[href="#tour"] use').getAttribute('href'),'#i-tour');
                const next=page.locator('.dock button[data-k="people"]');
                await next.hover();
                await page.locator('#screen picture[data-k="people"] img').evaluate(img=>(img as HTMLImageElement).decode());
                await next.click();
                await page.waitForFunction(()=>document.querySelector('.dock button[data-k="people"]')?.getAttribute('aria-selected')==='true');
                const transitions=await page.locator('.tour').evaluate(el=>el.getAnimations({subtree:true}).map(a=>({target:(a.effect as KeyframeEffect)?.target instanceof Element?((a.effect as KeyframeEffect).target as Element).className:'',property:(a as CSSTransition).transitionProperty})));
                assert.ok(transitions.some(a=>a.target.includes('utU0aa_active')&&a.property==='transform'),'选中按钮放大并上移');
                await page.waitForFunction(()=>{const frame=document.getElementById('screen')!;return frame.scrollLeft>0});
                await page.waitForFunction(()=>{const frame=document.getElementById('screen')!;return Math.abs(frame.scrollLeft-frame.clientWidth)<1});
                await page.waitForFunction(()=>document.querySelector('.dock [aria-selected="true"]')!.getAnimations().length===0);
                const aligned=await next.evaluate(el=>{const selected=el as HTMLElement,box=el.getBoundingClientRect(),label=document.getElementById('dock-label')!.getBoundingClientRect();return {scale:box.width/selected.offsetWidth,gap:box.top-label.bottom,center:Math.abs(box.left+box.width/2-label.left-label.width/2),icon:getComputedStyle(el.querySelector('svg')!).width}});
                assert.ok(Math.abs(aligned.scale-1.25)<.01,'选中按钮放大到 1.25 倍');
                assert.ok(Math.abs(aligned.gap-10)<1&&aligned.center<1,'标题跟随选中按钮并留 10px 间距');
                assert.equal(aligned.icon,'24px','图标保持可读尺寸');
                await next.press('End');
                await page.waitForFunction(()=>document.querySelector('.dock button[data-k="stats"]')?.getAttribute('aria-selected')==='true');
                assert.equal(await page.locator('.dock [aria-selected="true"]').evaluate(el=>el.getAnimations().length),0,'键盘选择立即响应');
                const faq = page.locator('#faq details').first();
                await faq.locator('summary').click();
                await page.waitForFunction(() => (document.querySelector('#faq details') as HTMLElement).getAnimations().length === 0);
                assert.equal(await faq.getAttribute('open'), '');
                assert.ok((await faq.locator('p').innerText()).length > 0, '问答内容可见');
                await faq.locator('summary').click();
                await page.waitForFunction(() => !((document.querySelector('#faq details') as HTMLElement) as HTMLDetailsElement).open);
                // 首次可见才初始化；离屏不继续改写内容，重新进入可续播。
                const card = page.locator('.live[data-mock="feed"]');
                await card.scrollIntoViewIfNeeded();
                await page.waitForFunction(()=>[...document.querySelectorAll('.feature-card-wrapper')].every(el=>el.getAnimations().every(animation=>animation.playState!=='running')));
                const heights=await page.locator('.feature-card-wrapper:not([hidden]) .feature-card').evaluateAll(cards=>cards.map(card=>{
                    const bounds=card.getBoundingClientRect(),divider=card.querySelector('.pFn2Lq_divider')!.getBoundingClientRect(),screen=card.querySelector('.live-screen')!.getBoundingClientRect();
                    const text=card.querySelector('.pFn2Lq_description')!,range=document.createRange();range.selectNodeContents(text);
                    return {height:bounds.height,divider:divider.top-bounds.top,screen:screen.top-bounds.top,textHeight:range.getBoundingClientRect().height,available:text.getBoundingClientRect().height};
                }));
                for(const key of ['height','divider','screen'] as const)assert.ok(Math.max(...heights.map(row=>row[key]))-Math.min(...heights.map(row=>row[key]))<1,`${language} ${width} 功能卡 ${key} 对齐：${JSON.stringify(heights)}`);
                assert.ok(heights.every(row=>row.textHeight<=row.available+1),'完整保留所有说明文字');
                assert.equal(await card.locator('.feature-icon svg use').count(),1);
                assert.match(await card.locator('.feature-card').evaluate(el=>getComputedStyle(el).backgroundImage),/linear-gradient/);
                assert.equal(await card.locator('.pFn2Lq_action svg path').count(),1);
                assert.equal(await page.locator('.nav-github').evaluate(el=>getComputedStyle(el,'::after').content),'none');
                assert.equal(await page.locator('.live[data-mock="follow"]').getAttribute('href'),'https://demo.peach.video/subscriptions?tab=add');
                assert.equal(await page.locator('.live[data-mock="theme"]').getAttribute('href'),'https://demo.peach.video/settings/appearance');
                await card.locator('.mk-cursor').waitFor({ state: 'visible' });
                const scale = await card.locator('.live-screen').evaluate(el => ({ width: el.clientWidth, scale: Number((el.querySelector('.mk') as HTMLElement).style.getPropertyValue('--mk-s')) }));
                assert.ok(Math.abs(scale.width / 720 - scale.scale) < .01, '画面按实际卡片宽度缩放');
                await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
                await page.waitForTimeout(1200);
                const paused = await card.locator('.mk-win').innerHTML();
                await page.waitForTimeout(600);
                assert.equal(await card.locator('.mk-win').innerHTML(), paused, '离屏暂停内容变动');
                await page.setViewportSize({ width: width === 390 ? 1440 : 390, height: 844 });
                await card.scrollIntoViewIfNeeded();
                await page.waitForFunction(() => { const s = (document.querySelector('.live[data-mock="feed"] .live-screen') as HTMLElement); return Math.abs(s.clientWidth / 720 - Number((s.querySelector('.mk') as HTMLElement).style.getPropertyValue('--mk-s'))) < .01; });
                assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '无横向溢出');
                assert.deepEqual(errors, []);
                console.log(`PASS 界面 ${language} ${width}: 导览切换、紧凑下载、选中背景、功能卡、问答与离屏暂停`);
            }
            finally {
                await page.close();
            }
        }
    for(const width of [260,320])for(const language of ['zh-CN','en']){
        const narrow=await browser.newPage({viewport:{width,height:844},locale:language});
        try{
            await narrow.route('**/releases.json',r=>r.fulfill({json:[]}));
            await narrow.route('https://api.github.com/**',r=>r.fulfill({json:[]}));
            await narrow.route('https://img.shields.io/**',r=>r.fulfill({json:{message:'v1.2.3'}}));
            await narrow.goto(new URL(language==='en'?'/en/':'/',base).href,{waitUntil:'networkidle'});
            await narrow.locator('[data-platform-option="docker"]').click();
            await narrow.waitForFunction(()=>{const group=document.querySelector('.platform-options')!.getBoundingClientRect(),item=document.querySelector('[data-platform-option="docker"]')!.getBoundingClientRect();return item.left>=group.left&&item.right<=group.right});
            const platform=await narrow.locator('.platform-options').evaluate(el=>{const b=el.getBoundingClientRect();return {scroll:el.scrollWidth,client:el.clientWidth,left:b.left,right:b.right,width:document.documentElement.clientWidth}});
            assert.ok(platform.scroll>platform.client&&platform.left>=0&&platform.right<=platform.width,'平台选项在框内横向滚动');
            await narrow.locator('.dock button[data-k="stats"]').click();
            await narrow.waitForFunction(()=>document.querySelector('.dock [data-k="stats"]')?.getAttribute('aria-selected')==='true');
            await narrow.waitForFunction(()=>{const group=document.querySelector('.dock-items')!.getBoundingClientRect(),item=document.querySelector('.dock [aria-selected="true"]')!.getBoundingClientRect();return item.left>=group.left&&item.right<=group.right});
            assert.ok(await narrow.locator('.dock-items').evaluate(el=>el.scrollWidth>el.clientWidth),'导览保留按钮尺寸并在框内滚动');
            await narrow.locator('.lang-menu button').click();
            const menu=await narrow.locator('.lang-list').evaluate(el=>{const b=el.getBoundingClientRect();return {left:b.left,right:b.right,width:document.documentElement.clientWidth}});
            assert.ok(menu.left>=0&&menu.right<=menu.width,'语言菜单不超出窄屏');
            await narrow.keyboard.press('Escape');
            assert.equal(await narrow.locator('.lang-list').isVisible(),false);
            console.log(`PASS 窄屏 ${language} ${width}: 平台与导览容器滚动、选中项可见、语言菜单`);
        }finally{await narrow.close()}
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, locale: 'zh-CN', reducedMotion: 'reduce' });
    try {
        await page.route('**/releases.json',r=>r.fulfill({json:[]}));
        await page.route('https://api.github.com/**',r=>r.fulfill({json:[]}));
        await page.route('https://img.shields.io/**',r=>r.fulfill({json:{message:'v1.2.3'}}));
        await page.goto(base, { waitUntil: 'networkidle' });
        await page.locator('.dock button[data-k="people"]').click();
        await page.waitForFunction(()=>document.querySelector('.dock button[data-k="people"]')?.getAttribute('aria-selected')==='true');
        assert.equal(await page.locator('.dock [aria-selected="true"]').evaluate(el=>el.getAnimations().length),0);
        assert.equal(await page.locator('#screen picture.on').evaluate(el=>getComputedStyle(el).transform),'none');
        await page.locator('.live[data-mock="feed"]').scrollIntoViewIfNeeded();
        assert.equal(await page.locator('.mk-cursor').count(), 0, '减少动态效果保留静态画面');
        await page.locator('#faq details:last-child summary').click();
        assert.equal(await page.locator('#faq details:last-child').evaluate(el => (el as HTMLDetailsElement).open), true);
        console.log('PASS 减少动态效果：静态卡片与问答可用');
    }
    finally {
        await page.close();
    }
}
finally {
    await browser.close();
}
