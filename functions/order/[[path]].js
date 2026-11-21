/**
 * /order/<order_number> —— 契约 §2
 * 用 Functions 按 200 直出 order.html 的内容，URL 保持不变（不用 _redirects 的 200 rewrite，
 * 否则目标 .html 会被 Pages 再 308 一次，破坏"不跳转"）。
 */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  const assetUrl = new URL('/order.html', url.origin);
  const asset = await context.env.ASSETS.fetch(new Request(assetUrl.toString(), context.request));
  const html = await asset.text();
  return new Response(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
