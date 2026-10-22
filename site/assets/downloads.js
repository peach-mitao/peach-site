import {renderCopy} from './copy.js';

const releasesUrl = 'https://github.com/peach-mitao/peach/releases';
const releasesApi = 'https://api.github.com/repos/peach-mitao/peach/releases?per_page=30';
const downloadsBase = 'https://downloads.peach.video';
const downloadsApi = downloadsBase + '/releases.json';
const dockerVersionApi = 'https://img.shields.io/docker/v/longmeidao/peach.json?sort=semver';

export function downloadCaption(platform, version) {
  const label = {windows: 'Windows', macos: 'macOS', docker: 'Docker'}[platform];
  if (!label) return 'Windows、macOS 与 Docker';
  const value = String(version || '').replace(/^v/, '');
  return label + (/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(value) ? ` · v${value}` : '');
}

export function platformFor(nav) {
  const ua = String(nav.userAgent || '');
  // iPad 的桌面标识也可能含 Mac；不把触屏 iPad 推荐为 Mac 安装包。
  if (/Android|iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && nav.maxTouchPoints > 1)) return 'other';
  const platform = nav.userAgentData?.platform || nav.platform || ua;
  if (/Win/i.test(platform)) return 'windows';
  if (/Mac/i.test(platform)) return 'macos';
  if (/Linux/i.test(platform)) return 'docker';
  return 'other';
}

export async function macArchitecture(nav) {
  if (platformFor(nav) !== 'macos') return null;
  try {
    const hints = await nav.userAgentData?.getHighEntropyValues?.(['architecture', 'bitness']);
    if (hints?.bitness && hints.bitness !== '64') return null;
    if (/^(arm|arm64|aarch64)$/i.test(hints?.architecture || '')) return 'arm64';
    if (/^(x86|x86_64|x64|amd64)$/i.test(hints?.architecture || '')) return 'x86_64';
  } catch { /* 浏览器不提供芯片信息时，让使用者明确选择。 */ }
  // Safari 在 Apple Silicon 上也可能报告 Intel Mac；不从 UA 推断芯片。
  return null;
}

export function downloadsFor(releases, source = 'github') {
  const result = {};
  if (!Array.isArray(releases)) return result;
  for (const release of releases.filter(r => r && !r.draft && Number.isFinite(Date.parse(r.published_at)))
    .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))) {
    const version = String(release.tag_name ?? '').replace(/^v/, '');
    if (!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(version)) continue;
    for (const [platform, names] of Object.entries({
      windows: {setup: `Peach-${version}-windows-x64-setup.exe`, portable: `Peach-${version}-windows-x64.zip`},
      macos: {'macos-arm64': `Peach-${version}-macos-arm64.dmg`, 'macos-x86_64': `Peach-${version}-macos-x86_64.dmg`},
    })) {
      if (result[platform] || !Object.values(names).every(name => release.assets?.some(asset =>
        asset.name === name && asset.state === 'uploaded'))) continue;
      result[platform] = {version, publishedAt: release.published_at, local: false, files: Object.fromEntries(Object.entries(names).map(([key, name]) =>
        [key, {name, href: `${source === 'r2' ? downloadsBase : releasesUrl + '/download'}/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}`}]))};
    }
  }
  return result;
}

function start() {
  const params = new URLSearchParams(location.search);
  const chosenPlatform = ['windows', 'macos', 'docker'].includes(params.get('platform')) ? params.get('platform') : null;
  const chosenArchitecture = ['arm64', 'x86_64'].includes(params.get('arch')) ? params.get('arch') : null;
  const state = {platform: chosenPlatform || platformFor(navigator), architecture: chosenArchitecture,
    manual: !!chosenPlatform, downloads: {}, localMac: null, dockerVersion: null};

  function render() {
    const mac = state.downloads.macos || state.localMac;
    const ready = state.platform === 'macos' ? mac : state.downloads.windows;
    const file = state.platform === 'windows' ? ready?.files.setup
      : state.platform === 'macos' && state.architecture ? ready?.files[`macos-${state.architecture}`] : null;
    const label = state.platform === 'windows' ? '下载 Windows 版' : state.platform === 'macos' ? '下载 macOS 版' : state.platform === 'docker' ? '部署 Docker 版' : '下载 Peach';
    const icon = state.platform === 'windows' ? '#i-windows' : state.platform === 'macos' ? '#i-apple' : state.platform === 'docker' ? '#i-docker' : '#i-download';
    document.querySelectorAll('[data-primary-download]').forEach(link => {
      link.href = file?.href || '#download';
      renderCopy(link.querySelector('span'), `download.primary.${state.platform}`, label);
      link.querySelector('use').setAttribute('href', icon);
      link.title = state.platform === 'macos' && !state.architecture ? '选择 Apple Silicon 或 Intel 版本' : label;
    });
    const caption = downloadCaption(state.platform, state.platform === 'docker' ? state.dockerVersion : ready?.version);
    document.querySelectorAll('[data-download-caption]').forEach(element => {
      renderCopy(element, `download.caption.${state.platform}.version.${ready?.local ? 'local' : 'public'}`, caption);
    });
    const panel = ['macos', 'docker'].includes(state.platform) ? state.platform : 'windows';
    document.querySelectorAll('[data-download-panel]').forEach(element => {element.hidden = element.dataset.downloadPanel !== panel});
    document.querySelectorAll('[data-platform-option]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.platformOption === panel));
    });
    document.querySelector('[data-source-panel]').hidden = panel === 'docker';
    for (const [platform, entry] of Object.entries({...state.downloads, ...(mac ? {macos: mac} : {})})) {
      document.querySelector(`[data-release-version="${platform}"]`).textContent = `v${entry.version} · ${entry.local ? '本地测试包' : '测试版'}`;
      for (const [kind, asset] of Object.entries(entry.files)) {
        const link = document.querySelector(`[data-download="${kind}"]`);
        if (!link) continue;
        link.href = asset.href;
        link.title = asset.name;
        link.removeAttribute('aria-disabled');
        renderCopy(link.querySelector('span'), `download.package.${kind}.ready`, {setup: '下载安装版', portable: '下载免安装版',
          'macos-arm64': '下载 Apple Silicon 版', 'macos-x86_64': '下载 Intel 版'}[kind]);
      }
    }
    const macStatus = mac
      ? `${mac.local ? '本地预览使用本机测试包，尚未公开发布。' : ''}测试包尚未经过 Apple 公证，首次打开前需要在终端运行一条命令。`
      : 'Mac 测试包尚未公开发布，发布后会在此提供下载。';
    renderCopy(document.querySelector('[data-macos-status]'), `download.macos-status.${mac ? mac.local ? 'local' : 'ready' : 'pending'}`, macStatus);
    const command = panel === 'macos' ? 'uv sync --locked --python 3.14 --extra macos\n./.venv/bin/peach-tray'
      : 'uv sync --locked --python 3.14\n& .\\.venv\\Scripts\\peach-tray.exe';
    renderCopy(document.querySelector('#src'), `download.source.${panel}`, 'git clone https://gitgud.io/peach-mitao/peach.git peach-app\ncd peach-app\n' + command);
    renderCopy(document.querySelector('[data-source-shell]'), `download.shell.${panel}`, panel === 'macos' ? 'zsh' : 'PowerShell');
  }

  document.querySelectorAll('[data-platform-option]').forEach(button => button.addEventListener('click', () => {
    state.platform = button.dataset.platformOption;
    state.manual = true;
    render();
  }));
  // Mac 包未公证，下载开始的同时弹出打开步骤；不阻止链接的默认下载。
  const macHelp = document.querySelector('[data-mac-help-dialog]');
  const showMacHelp = () => {if (macHelp && !macHelp.open) macHelp.showModal()};
  document.querySelectorAll('[data-mac-help]').forEach(button => button.addEventListener('click', showMacHelp));
  document.querySelectorAll('[data-primary-download]').forEach(link => link.addEventListener('click', () => {
    if (state.platform === 'macos' && /\.dmg$/i.test(link.pathname)) showMacHelp();
  }));
  document.querySelectorAll('[data-download]').forEach(link => link.addEventListener('click', event => {
    if (link.getAttribute('aria-disabled') === 'true') {event.preventDefault(); return}
    if (link.dataset.download.startsWith('macos-')) {
      state.platform = 'macos';
      state.architecture = link.dataset.download.slice(6);
      state.manual = true;
      render();
      showMacHelp();
    }
  }));
  render();
  addEventListener('peach:copy-saved', render);
  if (!state.manual) void macArchitecture(navigator).then(architecture => {
    if (!state.manual) {state.architecture = architecture; render()}
  });
  void (async () => {
    try {
      const response = await fetch(dockerVersionApi, {signal: AbortSignal.timeout(8000)});
      if (response.ok) {state.dockerVersion = (await response.json()).message; render()}
    } catch { /* 镜像版本未取得时只显示平台名。 */ }
  })();
  void (async () => {
    const preview = document.querySelector('meta[name="peach-local-downloads"]')?.content;
    if (preview) {
      try {
        const response = await fetch(preview);
        if (response.ok) {state.localMac = await response.json(); render()}
      } catch { /* 本地包不可用时仍展示公开发布状态。 */ }
    }
    const publicIndex = document.querySelector('meta[name="peach-public-downloads"]')?.content || downloadsApi;
    for (const [endpoint, source] of [[publicIndex, 'r2'], [releasesApi, 'github']]) {
      try {
        const response = await fetch(endpoint, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(8000)});
        if (!response.ok) continue;
        const downloads = downloadsFor(await response.json(), source);
        if (!Object.keys(downloads).length) continue;
        for (const [platform, entry] of Object.entries(downloads)) {
          const current = state.downloads[platform];
          if (!current || (entry.version !== current.version && Date.parse(entry.publishedAt) > Date.parse(current.publishedAt))) {
            state.downloads[platform] = entry;
          }
        }
        render();
      } catch { /* 公开下载源不可用时继续检查下一来源。 */ }
    }
  })();
}

if (typeof document !== 'undefined') start();
