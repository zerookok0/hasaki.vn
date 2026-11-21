/**
 * GET /api/cart —— 契约 §5.2，结构必须与 window.__BP_CART__ 完全一致。
 * 数据源：前端同步写入的 cookie（hs_cart / hs_order / hs_total）。
 */
export async function onRequestGet({ request }) {
  const cookie = request.headers.get('Cookie') || '';
  const get = (name) => {
    const m = cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  };
  let items = [];
  try { items = JSON.parse(get('hs_cart') || '[]'); } catch (e) { items = []; }
  const total = items.reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
  const totalAmount = String(total).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
  const order = get('hs_order') || '';
  return Response.json(
    {
      order_number: order,
      currency: 'VND',
      total,
      total_amount: totalAmount,
      items: items.map((i) => ({ name: i.name, qty: Number(i.qty) || 1, price: Math.round(Number(i.price) || 0) })),
      locale: 'vi',
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
