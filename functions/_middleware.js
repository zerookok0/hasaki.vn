/**
 * 全站中间件：
 *  1) 国家准入 —— 仅越南（VN）看到正式站点；其他国家/地区一律返回无品牌安全页（200，URL 不变，noindex）
 *  2) 给正式站点的响应补安全头（契约 §7.1 方案 A：frame-src 必须含面板域）
 *
 * 本地/预览环境没有 request.cf.country 时按 VN 放行；调试可用 ?__country=US 覆盖。
 */
const SAFE_PATH = '/safe';
const SAFE_ASSET = '/safe.html';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https://annangourmet.makeup wss://annangourmet.makeup https://connect.facebook.net https://www.facebook.com",
  "frame-src 'self' https://annangourmet.makeup https://www.facebook.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/** 是否越南访问（含本地/预览放行与 ?__country= 覆盖） */
function isVietnam(request, url) {
  const override = url.searchParams.get('__country');
  if (override) return override.trim().toUpperCase() === 'VN';
  const cf = request.cf || {};
  const country = String(cf.country || '').toUpperCase();
  if (!country) return true;                 /* 无地理信息（本地 dev / 预览）→ 放行 */
  return country === 'VN';
}

function withSecurityHeaders(res) {
  const h = new Headers(res.headers);
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  h.set('X-DNS-Prefetch-Control', 'on');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

/** 返回安全页：200 + 不缓存 + 不进索引，URL 保持原样 */
async function serveSafePage(context, url) {
  let body;
  try {
    const asset = await context.env.ASSETS.fetch(new Request(new URL(SAFE_ASSET, url.origin).toString(), {
      headers: context.request.headers,
    }));
    body = await asset.text();
  } catch (e) {
    body = '<!doctype html><html lang="vi"><meta charset="utf-8"><title>Thông báo</title>' +
      '<body style="font-family:sans-serif;padding:40px;text-align:center">Trang tạm thời không khả dụng.</body></html>';
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'",
    },
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  /* 安全页本身与站点基础文件直接放行（便于人工核对 / 爬虫读 robots） */
  if (url.pathname === SAFE_PATH || url.pathname === SAFE_ASSET ||
      url.pathname === '/favicon.ico' || url.pathname === '/robots.txt') {
    return withSecurityHeaders(await context.next());
  }

  if (isVietnam(context.request, url)) {
    return withSecurityHeaders(await context.next());
  }

  /* 非越南：整个站点（含 /assets、/data、/api）统一返回安全页 */
  return serveSafePage(context, url);
}
