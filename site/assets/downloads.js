const releasesUrl = 'https://github.com/peach-mitao/peach/releases';
const releasesApi = 'https://api.github.com/repos/peach-mitao/peach/releases?per_page=30';
const downloadsBase = 'https://downloads.peach.video';
const downloadsApi = downloadsBase + '/releases.json';

export function platformFor(nav) {
  const ua = String(nav.userAgent || '');
  // iPad 的桌面标识也可能含 Mac；不把触屏 iPad 推荐为 Mac 安装包。
  if (/Android|iPhone|iPad|iPod/i.test(ua) || (/Mac/i.test(ua) && nav.maxTouchPoints > 1)) return 'other';
  const platform = nav.userAgentData?.platform || nav.platform || ua;
  if (/Win/i.test(platform)) return 'windows';
  if (/Mac/i.test(platform)) return 'macos';
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
      result[platform] = {version, local: false, files: Object.fromEntries(Object.entries(names).map(([key, name]) =>
        [key, {name, href: `${source === 'r2' ? downloadsBase : releasesUrl + '/download'}/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}`}]))};
    }
  }
  return result;
}

function start() {
  const params = new URLSearchParams(location.search);
  const chosenPlatform = ['windows', 'macos'].includes(params.get('platform')) ? params.get('platform') : null;
  const chosenArchitecture = ['arm64', 'x86_64'].includes(params.get('arch')) ? params.get('arch') : null;
  const state = {platform: chosenPlatform || platformFor(navigator), architecture: chosenArchitecture,
    manual: !!chosenPlatform, downloads: {}, localMac: null};
  const macName = () => state.architecture === 'arm64' ? 'Apple Silicon' : 'Intel';

  function render() {
    const mac = state.downloads.macos || state.localMac;
    const ready = state.platform === 'macos' ? mac : state.downloads.windows;
    const file = state.platform === 'windows' ? ready?.files.setup
      : state.platform === 'macos' && state.architecture ? ready?.files[`macos-${state.architecture}`] : null;
    const label = state.platform === 'windows' ? '下载 Windows 版' : state.platform === 'macos' ? '下载 macOS 版' : '下载 Peach';
    const icon = state.platform === 'windows' ? '#i-windows' : state.platform === 'macos' ? '#i-apple' : '#i-download';
    document.querySelectorAll('[data-primary-download]').forEach(link => {
      link.href = file?.href || '#download';
      link.querySelector('span').textContent = label;
      link.querySelector('use').setAttribute('href', icon);
      link.title = state.platform === 'macos' && !state.architecture ? '选择 Apple Silicon 或 Intel 版本' : label;
    });
    const caption = state.platform === 'windows' ? 'Windows 64 位 · 安装包与免安装版'
      : state.platform === 'macos' ? `${state.architecture ? macName() + ' · ' : ''}${ready?.local ? '本地测试包' : 'DMG · 测试版'}`
      : '可在 Windows 或 macOS 电脑上安装';
    document.querySelectorAll('[data-download-caption]').forEach(element => {element.textContent = caption});
    const panel = state.platform === 'macos' ? 'macos' : 'windows';
    document.querySelectorAll('[data-download-panel]').forEach(element => {element.hidden = element.dataset.downloadPanel !== panel});
    document.querySelectorAll('[data-platform-option]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.platformOption === panel));
    });
    document.querySelector('[data-platform-hint]').textContent = state.platform === 'macos'
      ? state.architecture ? `${macName()} · DMG` : '在「关于本机」中查看芯片或处理器'
      : state.platform === 'windows' ? 'Windows 64 位' : '支持 Windows 与 macOS';
    for (const [platform, entry] of Object.entries({...state.downloads, ...(mac ? {macos: mac} : {})})) {
      document.querySelector(`[data-release-version="${platform}"]`).textContent = `v${entry.version} · ${entry.local ? '本地测试包' : '测试版'}`;
      for (const [kind, asset] of Object.entries(entry.files)) {
        const link = document.querySelector(`[data-download="${kind}"]`);
        if (!link) continue;
        link.href = asset.href;
        link.title = asset.name;
        link.removeAttribute('aria-disabled');
        link.querySelector('span').textContent = {setup: '下载安装版', portable: '下载免安装版',
          'macos-arm64': '下载 Apple Silicon 版', 'macos-x86_64': '下载 Intel 版'}[kind];
      }
    }
    document.querySelector('[data-macos-status]').textContent = mac
      ? `${mac.local ? '本地预览使用本机测试包，尚未公开发布。' : ''}测试包未公证，媒体工具需另行准备。`
      : 'Mac 测试包尚未公开发布，发布后会在此提供下载。';
    const command = panel === 'macos' ? 'uv sync --locked --python 3.14 --extra macos\n./.venv/bin/peach-tray'
      : 'uv sync --locked --python 3.14\n& .\\.venv\\Scripts\\peach-tray.exe';
    document.querySelector('#src').textContent = 'git clone https://github.com/peach-mitao/peach.git peach-app\ncd peach-app\n' + command;
    document.querySelector('[data-source-shell]').textContent = panel === 'macos' ? 'zsh' : 'PowerShell';
  }

  document.querySelectorAll('[data-platform-option]').forEach(button => button.addEventListener('click', () => {
    state.platform = button.dataset.platformOption;
    state.manual = true;
    render();
  }));
  document.querySelectorAll('[data-download]').forEach(link => link.addEventListener('click', event => {
    if (link.getAttribute('aria-disabled') === 'true') {event.preventDefault(); return}
    if (link.dataset.download.startsWith('macos-')) {
      state.platform = 'macos';
      state.architecture = link.dataset.download.slice(6);
      state.manual = true;
      render();
    }
  }));
  render();
  if (!state.manual) void macArchitecture(navigator).then(architecture => {
    if (!state.manual) {state.architecture = architecture; render()}
  });
  void (async () => {
    const preview = document.querySelector('meta[name="peach-local-downloads"]')?.content;
    if (preview) {
      try {
        const response = await fetch(preview);
        if (response.ok) {state.localMac = await response.json(); render()}
      } catch { /* 本地包不可用时仍展示公开发布状态。 */ }
    }
    for (const [endpoint, source] of [[downloadsApi, 'r2'], [releasesApi, 'github']]) {
      try {
        const response = await fetch(endpoint, {headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(8000)});
        if (!response.ok) continue;
        const downloads = downloadsFor(await response.json(), source);
        if (!Object.keys(downloads).length) continue;
        state.downloads = downloads;
        render();
        break;
      } catch { /* 公开下载源不可用时继续检查下一来源。 */ }
    }
  })();
}

if (typeof document !== 'undefined') start();
