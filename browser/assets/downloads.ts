interface DownloadEntry {version:string;publishedAt?:string;local:boolean;files:Record<string,{name:string;href:string}>}
type DownloadMap=Partial<Record<string,DownloadEntry>>;
interface Release {tag_name:string;published_at:string;draft?:boolean;assets?:{name:string;state?:string}[]}
import { renderCopy } from './copy.ts';
import { t } from './i18n.ts';
const releasesUrl = 'https://github.com/peach-mitao/peach/releases';
const releasesApi = 'https://api.github.com/repos/peach-mitao/peach/releases?per_page=30';
const downloadsBase = 'https://downloads.peach.video';
const downloadsApi = downloadsBase + '/releases.json';
const dockerVersionApi = 'https://img.shields.io/docker/v/longmeidao/peach.json?sort=semver';
export function downloadCaption(platform: string, version: unknown) {
    const label = { windows: 'Windows', macos: 'macOS', docker: 'Docker' }[platform];
    if (!label)
        return t('Windows、macOS 与 Docker');
    const value = String(version || '').replace(/^v/, '');
    return label + (/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(value) ? ` · v${value}` : '');
}
export function platformFor(nav: Pick<Navigator,'userAgent'|'maxTouchPoints'|'platform'|'userAgentData'>) {
    const ua = String(nav.userAgent || '');
    // iPad 的桌面标识也可能含 Mac；不把触屏 iPad 推荐为 Mac 安装包。
    if (/Android|iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && nav.maxTouchPoints > 1))
        return 'other';
    const platform = nav.userAgentData?.platform || nav.platform || ua;
    if (/Win/i.test(platform))
        return 'windows';
    if (/Mac/i.test(platform))
        return 'macos';
    if (/Linux/i.test(platform))
        return 'docker';
    return 'other';
}
export async function macArchitecture(nav: Pick<Navigator,'userAgent'|'maxTouchPoints'|'platform'|'userAgentData'>) {
    if (platformFor(nav) !== 'macos')
        return null;
    try {
        const hints = await nav.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness']);
        if (hints?.bitness && hints.bitness !== '64')
            return null;
        if (/^(arm|arm64|aarch64)$/i.test(hints?.architecture || ''))
            return 'arm64';
        if (/^(x86|x86_64|x64|amd64)$/i.test(hints?.architecture || ''))
            return 'x86_64';
    }
    catch { /* 浏览器不提供芯片信息时，让使用者明确选择。 */ }
    // Safari 在 Apple Silicon 上也可能报告 Intel Mac；不从 UA 推断芯片。
    return null;
}
export function downloadsFor(releases: Release[], source = 'github') {
    const result: DownloadMap = {};
    if (!Array.isArray(releases))
        return result;
    for (const release of releases.filter(r => r && !r.draft && Number.isFinite(Date.parse(r.published_at)))
        .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))) {
        const version = String(release.tag_name ?? '').replace(/^v/, '');
        if (!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(version))
            continue;
        for (const [platform, names] of Object.entries({
            windows: { setup: `Peach-${version}-windows-x64-setup.exe`, portable: `Peach-${version}-windows-x64.zip` },
            macos: { 'macos-arm64': `Peach-${version}-macos-arm64.dmg`, 'macos-x86_64': `Peach-${version}-macos-x86_64.dmg` },
        })) {
            if (result[platform] || !Object.values(names).every(name => release.assets?.some((asset) => asset.name === name && asset.state === 'uploaded')))
                continue;
            result[platform] = { version, publishedAt: release.published_at, local: false, files: Object.fromEntries(Object.entries(names).map(([key, name]) => [key, { name, href: `${source === 'r2' ? downloadsBase : releasesUrl + '/download'}/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}` }])) };
        }
    }
    return result;
}
function start() {
    const params = new URLSearchParams(location.search);
    const chosenPlatform = ['windows', 'macos', 'docker'].includes(params.get('platform')||'') ? params.get('platform') : null;
    const chosenArchitecture = ['arm64', 'x86_64'].includes(params.get('arch')||'') ? params.get('arch') : null;
    const state: {platform:string;architecture:string|null;manual:boolean;downloads:DownloadMap;localMac:DownloadEntry|null;dockerVersion:string|null;releasesSettled:boolean;dockerSettled:boolean} = { platform: chosenPlatform || platformFor(navigator), architecture: chosenArchitecture,
        manual: !!chosenPlatform, downloads: {}, localMac: null, dockerVersion: null, releasesSettled: false, dockerSettled: false };
    let releaseRequest:Promise<void>|null=null,lastReleaseCheck=0;
    function render() {
        const mac = state.downloads.macos || state.localMac;
        const ready = state.platform === 'macos' ? mac : state.downloads.windows;
        const file = state.platform === 'windows' ? ready?.files.setup
            : state.platform === 'macos' && state.architecture ? ready?.files[`macos-${state.architecture}`] : null;
        const label = state.platform === 'windows' ? t('下载 Windows 版') : state.platform === 'macos' ? t('下载 macOS 版')
            : state.platform === 'docker' ? t('部署 Docker 版') : t('下载 Peach');
        const icon = state.platform === 'windows' ? '#i-windows' : state.platform === 'macos' ? '#i-apple' : state.platform === 'docker' ? '#i-docker' : '#i-download';
        (document.querySelectorAll('[data-primary-download]') as NodeListOf<HTMLAnchorElement>).forEach(link => {
            link.href = file?.href || '#download';
            renderCopy((link.querySelector('span') as HTMLElement), `download.primary.${state.platform}`, label);
            (link.querySelector('use') as SVGUseElement).setAttribute('href', icon);
            link.title = state.platform === 'macos' && !state.architecture ? t('选择 Apple Silicon 或 Intel 版本') : label;
        });
        const caption = downloadCaption(state.platform, state.platform === 'docker' ? state.dockerVersion : ready?.version);
        (document.querySelectorAll('[data-download-caption]') as NodeListOf<HTMLElement>).forEach(element => {
            renderCopy(element, `download.caption.${state.platform}.version.${ready?.local ? 'local' : 'public'}`, caption);
        });
        const panel = ['macos', 'docker'].includes(state.platform) ? state.platform : 'windows';
        (document.querySelectorAll('[data-download-panel]') as NodeListOf<HTMLElement>).forEach(element => { element.hidden = element.dataset.downloadPanel !== panel; });
        (document.querySelectorAll('[data-platform-option]') as NodeListOf<HTMLElement>).forEach(button => {
            button.setAttribute('aria-pressed', String(button.dataset.platformOption === panel));
        });
        (document.querySelector('[data-source-panel]') as HTMLElement).hidden = panel === 'docker';
        for (const [platform, entry] of Object.entries({ ...state.downloads, ...(mac ? { macos: mac } : {}) })) {
            (document.querySelector(`[data-release-version="${platform}"]`) as HTMLElement).textContent = `v${entry.version} · ${entry.local ? t('本地测试包') : t('测试版')}`;
            for (const [kind, asset] of Object.entries(entry.files)) {
                const link = (document.querySelector(`[data-download="${kind}"]`) as HTMLAnchorElement);
                if (!link)
                    continue;
                link.href = asset.href;
                link.title = asset.name;
                link.removeAttribute('aria-disabled');
                renderCopy((link.querySelector('span') as HTMLElement), `download.package.${kind}.ready`, { setup: t('下载安装版'), portable: t('下载免安装版'),
                    'macos-arm64': t('下载 Apple Silicon 版'), 'macos-x86_64': t('下载 Intel 版') }[kind]!);
            }
        }
        const macStatus = mac
            ? (mac.local ? t('本地预览使用本机测试包，尚未公开发布。') : '') + t('测试包尚未经过 Apple 公证，首次打开前需要在终端运行一条命令。')
            : t('Mac 测试包尚未公开发布，发布后会在此提供下载。');
        renderCopy((document.querySelector('[data-macos-status]') as HTMLElement), `download.macos-status.${mac ? mac.local ? 'local' : 'ready' : 'pending'}`, macStatus);
        const command = panel === 'macos' ? 'uv sync --locked --python 3.14 --extra macos\n./.venv/bin/peach-tray'
            : 'uv sync --locked --python 3.14\n& .\\.venv\\Scripts\\peach-tray.exe';
        renderCopy((document.querySelector('#src') as HTMLElement), `download.source.${panel}`, 'git clone https://gitgud.io/peach-mitao/peach.git peach-app\ncd peach-app\n' + command);
        renderCopy((document.querySelector('[data-source-shell]') as HTMLElement), `download.shell.${panel}`, panel === 'macos' ? 'zsh' : 'PowerShell');
        // 首屏文字定稿后再显示：按钮随首次渲染，版本行等到当前平台取得版本或发行清单查完。
        const root = document.documentElement;
        root.classList.remove('dl-label-pending');
        if (state.platform === 'docker' ? state.dockerSettled
            : !['windows', 'macos'].includes(state.platform) || state.releasesSettled || ready) {
            root.classList.remove('dl-meta-pending');
        }
    }
    (document.querySelectorAll('[data-platform-option]') as NodeListOf<HTMLElement>).forEach(button => button.addEventListener('click', () => {
        state.platform = button.dataset.platformOption!;
        state.manual = true;
        render();
    }));
    // Mac 包未公证，下载开始的同时弹出打开步骤；不阻止链接的默认下载。
    const macHelp = (document.querySelector('[data-mac-help-dialog]') as HTMLDialogElement);
    const showMacHelp = () => { if (macHelp && !macHelp.open)
        macHelp.showModal(); };
    (document.querySelectorAll('[data-mac-help]') as NodeListOf<HTMLElement>).forEach(button => button.addEventListener('click', showMacHelp));
    (document.querySelectorAll('[data-primary-download]') as NodeListOf<HTMLAnchorElement>).forEach(link => link.addEventListener('click', () => {
        if (state.platform === 'macos' && /\.dmg$/i.test(link.pathname))
            showMacHelp();
    }));
    (document.querySelectorAll('[data-download]') as NodeListOf<HTMLElement>).forEach(link => link.addEventListener('click', event => {
        if (link.getAttribute('aria-disabled') === 'true') {
            event.preventDefault();
            return;
        }
        if (link.dataset.download!.startsWith('macos-')) {
            state.platform = 'macos';
            state.architecture = link.dataset.download!.slice(6);
            state.manual = true;
            render();
            showMacHelp();
        }
    }));
    render();
    addEventListener('peach:copy-saved', render);
    if (!state.manual)
        void macArchitecture(navigator).then(architecture => {
            if (!state.manual) {
                state.architecture = architecture;
                render();
            }
        });
    void (async () => {
        try {
            const response = await fetch(dockerVersionApi, { cache:'no-store', signal: AbortSignal.timeout(8000) });
            if (response.ok)
                state.dockerVersion = (await response.json()).message;
        }
        catch { /* 镜像版本未取得时只显示平台名。 */ }
        state.dockerSettled = true;
        render();
    })();
    function refreshDownloads(force=false):Promise<void>{
        if(releaseRequest)return releaseRequest;
        if(!force&&Date.now()-lastReleaseCheck<60000)return Promise.resolve();
        releaseRequest=(async () => {
        const preview = (document.querySelector('meta[name="peach-local-downloads"]') as HTMLMetaElement)?.content;
        if (preview) {
            try {
                const response = await fetch(preview,{cache:'no-store'});
                if (response.ok) {
                    state.localMac = await response.json();
                    render();
                }
            }
            catch { /* 本地包不可用时仍展示公开发布状态。 */ }
        }
        const publicIndex = (document.querySelector('meta[name="peach-public-downloads"]') as HTMLMetaElement)?.content || downloadsApi;
        for (const [endpoint, source] of [[publicIndex, 'r2'], [releasesApi, 'github']] as const) {
            try {
                const response = await fetch(endpoint, { cache:'no-store', headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
                if (!response.ok)
                    continue;
                const downloads = downloadsFor(await response.json(), source);
                if (!Object.keys(downloads).length)
                    continue;
                for (const [platform, entry] of Object.entries(downloads)) {
                    const current = state.downloads[platform];
                    if (entry&&(!current || (source==='r2'&&entry.version===current.version) || (entry.version !== current.version && Date.parse(entry.publishedAt||'') > Date.parse(current.publishedAt||'')))) {
                        state.downloads[platform] = entry;
                    }
                }
                render();
            }
            catch { /* 公开下载源不可用时继续检查下一来源。 */ }
        }
        state.releasesSettled = true;
        render();
        })().finally(()=>{lastReleaseCheck=Date.now();releaseRequest=null});
        return releaseRequest;
    }
    void refreshDownloads(true);
    addEventListener('pageshow',event=>{if(event.persisted)void refreshDownloads(true)});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')void refreshDownloads()});
    for(const name of ['pointerover','focusin'])document.addEventListener(name,event=>{if(event.target instanceof Element&&event.target.closest('[data-primary-download],[data-download],[data-platform-option]'))void refreshDownloads()});
}
if (typeof document !== 'undefined')
    start();
