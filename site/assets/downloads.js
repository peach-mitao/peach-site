const releasesUrl = 'https://github.com/peach-mitao/peach/releases';

async function loadDownloads() {
  try {
    const response = await fetch('https://api.github.com/repos/peach-mitao/peach/releases?per_page=30', {
      headers: {Accept: 'application/vnd.github+json'},
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return;
    const releases = await response.json();
    if (!Array.isArray(releases)) return;

    for (const release of releases.filter(r => r && !r.draft && r.published_at)
      .sort((a, b) => Date.parse(b.published_at) - Date.parse(a.published_at))) {
      const version = String(release.tag_name ?? '').replace(/^v/, '');
      if (!/^\d+\.\d+\.\d+(?:-[\da-z.-]+)?(?:\+[\da-z.-]+)?$/i.test(version)) continue;
      const names = {
        setup: `Peach-${version}-windows-x64-setup.exe`,
        portable: `Peach-${version}-windows-x64.zip`,
      };
      if (!Object.values(names).every(name => release.assets?.some(asset =>
        asset.name === name && asset.state === 'uploaded'))) continue;

      for (const [kind, name] of Object.entries(names)) {
        const link = document.querySelector(`[data-download="${kind}"]`);
        if (!link) continue;
        link.href = `${releasesUrl}/download/${encodeURIComponent(release.tag_name)}/${encodeURIComponent(name)}`;
        link.querySelector('code').textContent = name;
      }
      return;
    }
  } catch {
    // Releases 页面在网络不可用、限流或发布包尚未就绪时仍可访问。
  }
}

loadDownloads();
