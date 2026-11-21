/**
 * POST /api/checkout —— 契约 §6.1
 * 🔴 永远 200 + JSON，绝不 302/303；order_number 原样回传；幂等；无验证码。
 * 卡片数据不会到这里（只走面板通道）。
 */
export async function onRequestPost({ request }) {
  const origin = request.headers.get('Origin') || '';
  const url = new URL(request.url);
  if (origin && origin !== url.origin) {
    return Response.json({ ok: false, error_code: 'bad_origin', message: 'Nguồn yêu cầu không hợp lệ.' }, { status: 200 });
  }

  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  const orderNumber = String(body.order_number || '').trim();
  const amount = Number(body.amount);
  const currency = String(body.currency || 'VND');

  if (!orderNumber) {
    return Response.json({ ok: false, error_code: 'missing_order_number', message: 'Thiếu mã đơn hàng.' }, { status: 200 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ ok: false, error_code: 'invalid_amount', message: 'Số tiền không hợp lệ.' }, { status: 200 });
  }

  /* 幂等：同一 order_number 重复提交视为同一单（用户连点两次不算两单） */
  return Response.json(
    { ok: true, order_number: orderNumber, amount, currency, ts: new Date().toISOString() },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
}
