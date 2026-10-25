type RegionRequest = Request & {cf?: {country?: string}};
type Assets = {fetch(request: Request): Promise<Response> | Response};

// 仅放行提示页使用的样式、字体和标识，馆藏与普通页面资源仍受地区限制。
const supportAsset = (path: string) => [
  '/assets/support.css', '/assets/support-ui/support.css',
  '/assets/support-ui/peach-pages.css', '/assets/support-ui/logo.png',
  '/assets/support-ui/inter/index.css',
].includes(path) || /^\/assets\/support-ui\/inter\/files\/[a-zA-Z0-9._-]+\.woff2?$/.test(path);

export async function regionResponse(request: RegionRequest, assets: Assets): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname === '/credits/ip-data') {
    const body = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="robots" content="noindex, nofollow"><title>IP 数据许可 · Peach</title><main><h1>IP 数据许可</h1><p>地区网段数据来自 <a href="https://db-ip.com/">DB-IP Country Lite</a>（<a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>）及 <a href="https://www.iplocate.io/">IPLocate</a>（<a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a>）。</p><p>Peach 提取两库标为 CN 的网段并取并集，派生数据按 CC BY-SA 4.0 分发。数据更新与缓存会影响当前结果，数据提供者不为 Peach 的服务地区决定背书。</p></main></html>';
    return new Response(request.method === 'HEAD' ? null : body, {headers: {'content-type': 'text/html; charset=utf-8', 'cache-control': 'private, no-store', 'x-robots-tag': 'noindex, nofollow'}});
  }
  if (['/unavailable', '/unavailable/', '/unavailable.html'].includes(url.pathname)) {
    const page = await assets.fetch(new Request(new URL('/unavailable.html', url)));
    const headers = new Headers(page.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'private, no-store');
    headers.set('x-robots-tag', 'noindex, nofollow');
    return new Response(request.method === 'HEAD' ? null : page.ok ? page.body : '不提供服务', {status: 403, headers});
  }
  if (supportAsset(url.pathname)) return null;
  // 地区由 Cloudflare 的连接元数据判断，不读取客户端请求头或远端地区数据库。
  const mainland = request.cf?.country === 'CN';
  if (!mainland) return null;
  return new Response(null, {status: ['GET', 'HEAD'].includes(request.method) ? 302 : 303, headers: {
    location: new URL('/unavailable', url).href,
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow',
  }});
}
