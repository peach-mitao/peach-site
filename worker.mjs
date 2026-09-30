// 视频经 Cloudflare Cache API 返回字节范围；其余文件由静态资源层提供。
import manifest from './assets-manifest.json';

const videoPath = '/assets/peach-intro-720p.mp4';
const video = manifest.files.find(file => '/' + file.path === videoPath);
const etag = `"${video.sha256}"`;

function mediaResponse(response, head = false) {
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  return new Response(head ? null : response.body, {status:response.status, headers});
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== videoPath || !['GET', 'HEAD'].includes(request.method)) {
      return env.ASSETS.fetch(request);
    }
    const cacheUrl = new URL(request.url);
    cacheUrl.search = `?media-version=${video.sha256}`;
    const headers = new Headers(request.headers);
    // If-Range 验证器不匹配时返回完整表示。
    if (headers.has('If-Range') && headers.get('If-Range') !== etag) headers.delete('Range');
    const lookup = new Request(cacheUrl, {headers});
    const cache = caches.default;
    let response = await cache.match(lookup);
    if (!response) {
      const assetUrl = new URL(request.url);
      assetUrl.search = '';
      const asset = await env.ASSETS.fetch(new Request(assetUrl));
      if (asset.status !== 200) return mediaResponse(asset, request.method === 'HEAD');
      const storedHeaders = new Headers(asset.headers);
      storedHeaders.set('Cache-Control', 'public, max-age=3600');
      storedHeaders.set('ETag', etag);
      storedHeaders.set('Content-Length', String(video.bytes));
      await cache.put(new Request(cacheUrl), new Response(asset.body, {headers:storedHeaders}));
      response = await cache.match(lookup);
    }
    if (!response) {
      return new Response('视频暂时不可用，请稍后重试', {
        status:503, headers:{'Cache-Control':'no-store', 'Retry-After':'1'},
      });
    }
    return mediaResponse(response, request.method === 'HEAD');
  },
};
