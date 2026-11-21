/**
 * 全站安全头（_headers 对 Functions 不生效，这里补同一份）
 * 契约 §7.1 方案 A：frame-src 必须放行面板域名 https://annangourmet.makeup
 */
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

export async function onRequest(context) {
  const res = await context.next();
  const h = new Headers(res.headers);
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  h.set('X-DNS-Prefetch-Control', 'on');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}
