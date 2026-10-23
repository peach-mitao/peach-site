import type {Rule} from './behavior-contract.ts';
const rule=(id:string,label:string,selector:string,region=false):Rule=>({id,label,selector,region});
export const siteRules:Rule[]=[
 ...['hero','tour','live','promise','features','download','faq'].map(id=>rule('region.'+id,id,id==='hero'?'.hero':'#'+id,true)),
 rule('region.nav','导航','.nav',true),rule('region.footer','页脚','footer',true),rule('region.copyright','版权说明','body:has(#copyright-form)',true),
 ...['tour','live','features','download','faq'].map(id=>rule('nav.'+id,id,`.nav-links a[href="#${id}"]`)),
 rule('nav.home','首页','a.brand,a[href="/"],a[href="/en/"]'),rule('nav.language','语言菜单','.lang-menu > button'),
 rule('nav.language.zh','中文','a[lang="zh-CN"]'),rule('nav.language.en','英文','a[lang="en"]'),
 rule('external.github','GitHub','a[href*="github.com"]'),rule('external.telegram','Telegram','a[href*="t.me/"]'),rule('external.x','X','a[href*="x.com/"]'),
 rule('demo.open','打开演示','a[href^="https://demo.peach.video"]'),
 rule('external.docker','镜像仓库','a[href^="https://hub.docker.com/"]'),rule('video.volume','调节音量','[data-media-volume]'),
 rule('nav.download','下载区域','a[href="#download"]'),rule('external.microsoft','Windows 安全说明','a[href^="https://support.microsoft.com/"]'),rule('external.gitgud','GitGud','a[href^="https://gitgud.io/"]'),rule('external.uv','uv 安装文档','a[href^="https://docs.astral.sh/"]'),
 rule('download.alternatives','其他下载','.download-alternatives'),rule('download.primary','下载 Peach','[data-primary-download]'),
 ...['windows','macos','docker'].map(id=>rule('platform.'+id,id,`[data-platform-option="${id}"]`)),
 ...['setup','portable','macos-arm64','macos-x86_64'].map(id=>rule('download.'+id,id,`[data-download="${id}"]`)),
 ...['home','people','profile','play','follow','stats'].map(id=>rule('tour.'+id,id,`.dock button[data-k="${id}"]`)),
 rule('faq.expand','常见问题','#faq summary'),rule('mac.help.open','打开 Mac 帮助','[data-mac-help]'),rule('mac.help.close','关闭 Mac 帮助','[data-mac-help-dialog] button:not([data-copy])'),
 rule('copy.command','复制命令','button[data-copy]'),rule('privacy.open','统计偏好','a[href="/privacy/analytics"]'),rule('copyright.open','版权','a[href*="copyright"]'),
 rule('copyright.prepare','准备投诉邮件','#prepare'),rule('copyright.compose','打开邮件客户端','#compose'),rule('copyright.copy','复制投诉正文','#copy'),rule('copyright.mail','投诉邮箱','a[href^="mailto:"]'),
 rule('copyright.field','填写投诉信息','#copyright-form input,#copyright-form select,#copyright-form textarea'),
 ...['01-open','close','center-toggle','play','mute','speed-toggle','speed-option','pip','fullscreen'].map(id=>rule('video.'+id,'视频 '+id,`[data-media-${id}]`)),
];
export function siteState(){return document.querySelector('dialog[open][data-mac-help-dialog]')?'mac-help':document.querySelector('[data-media-modal]:not([hidden])')?'video':`platform.${document.querySelector<HTMLElement>('[data-platform-option][aria-pressed="true"]')?.dataset.platformOption||'windows'}`}
