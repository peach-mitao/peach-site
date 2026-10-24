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
  if (['/unavailable', '/unavailable/', '/unavailable.html'].includes(url.pathname)) {
    const page = await assets.fetch(new Request(new URL('/unavailable.html', url)));
    const headers = new Headers(page.headers);
    headers.set('content-type', 'text/html; charset=utf-8');
    headers.set('cache-control', 'private, no-store');
    headers.set('x-robots-tag', 'noindex, nofollow');
    return new Response(request.method === 'HEAD' ? null : page.ok ? page.body : '不提供服务', {status: 403, headers});
  }
  if (request.cf?.country !== 'CN' || supportAsset(url.pathname)) return null;
  return new Response(null, {status: ['GET', 'HEAD'].includes(request.method) ? 302 : 303, headers: {
    location: new URL('/unavailable', url).href,
    'cache-control': 'private, no-store',
    'x-robots-tag': 'noindex, nofollow',
  }});
}
