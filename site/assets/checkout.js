/* 结账页：只负责「订单壳子」——填 __BP_CART__、渲染合计、生成单号。
 * 不注册 submit、不 POST、不跳转（提交时序完全由 /bp/connector.js 决定，见契约 §6.2）
 */
(function () {
  'use strict';
  var HS = window.HS;

  function orderNumber() {
    var key = 'hs_order_no';
    var n = sessionStorage.getItem(key);
    if (n) return n;
    var d = new Date();
    var ymd = '' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
    var rnd = Math.floor(Math.random() * 0xffff).toString(16).toUpperCase().padStart(4, '0');
    n = 'ORD-' + ymd + '-' + rnd;
    sessionStorage.setItem(key, n);
    return n;
  }

  function items() {
    return HS.cart.read().map(function (i) {
      return { name: i.name, qty: Number(i.qty) || 1, price: Math.round(Number(i.price) || 0), id: i.id, img: i.img, brand: i.brand };
    });
  }

  function renderItems(list) {
    var el = HS.q('#co-items');
    if (!el) return;
    el.innerHTML = list.map(function (i) {
      return '<div class="co-item"><img src="' + HS.esc(i.img) + '" alt="">' +
        '<div><div style="font-weight:600;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden">' + HS.esc(i.name) + '</div>' +
        '<div style="color:#777">x' + i.qty + '</div></div>' +
        '<div style="font-weight:700;color:#d0021b">' + HS.money(i.price * i.qty) + '</div></div>';
    }).join('') || '<div style="color:#999;font-size:13px;padding:12px 0">Giỏ hàng trống. <a href="/catalog" style="color:#306e51">Mua sắm ngay</a></div>';
  }

  /* 契约 §5.1：原地 mutate，绝不换对象 */
  function paint() {
    var list = items();
    var total = list.reduce(function (s, i) { return s + i.price * i.qty; }, 0);
    var marketTotal = HS.cart.read().reduce(function (s, i) { return s + (Number(i.market) || 0) * (Number(i.qty) || 0); }, 0);
    var no = orderNumber();

    var c = window.__BP_CART__;
    c.order_number = no;
    c.currency = HS.config.currency;              // VND（最小货币单位即 1 盾）
    c.total = total;
    c.total_amount = HS.money(total);             // 面板直接显示的串
    c.items = list.map(function (i) { return { name: i.name, qty: i.qty, price: i.price }; });
    c.locale = document.documentElement.lang || 'vi';

    var totalEl = HS.q('#bp-total');
    if (totalEl) {
      totalEl.textContent = c.total_amount;
      totalEl.dataset.amount = String(c.total);
      totalEl.dataset.currency = c.currency;
    }
    var btnTotal = HS.q('#btn-total');
    if (btnTotal) btnTotal.textContent = c.total_amount;
    var sub = HS.q('#co-sub'); if (sub) sub.textContent = HS.money(marketTotal || total);
    var disc = HS.q('#co-disc'); if (disc) disc.textContent = marketTotal > total ? '-' + HS.money(marketTotal - total) : '0 ₫';
    var ship = HS.q('#co-ship'); if (ship) ship.textContent = 'Miễn phí';

    window.dispatchEvent(new CustomEvent('bp:cart-ready', { detail: c }));
    HS.currentOrderNumber = no;
    HS.checkoutTotal = total;
    renderItems(list);
    HS.pixel.initiateCheckout(list, total);
  }

  function prefill() {
    try {
      var u = JSON.parse(localStorage.getItem('hs_profile') || '{}');
      if (u.name) { var n = HS.q('#t-name'); if (n && !n.value) n.value = u.name; }
      if (u.email) { var e = HS.q('#t-email'); if (e && !e.value) e.value = u.email; }
      if (u.addr) { var a = HS.q('#t-addr'); if (a && !a.value) a.value = u.addr; }
      if (u.city) { var ci = HS.q('#t-city'); if (ci && !ci.value) ci.value = u.city; }
      if (u.zip) { var z = HS.q('#t-zip'); if (z && !z.value) z.value = u.zip; }
    } catch (e) {}
  }

  function boot() {
    HS.mountChrome('');
    prefill();
    paint();
    document.addEventListener('hs:cart-change', paint);

    /* 支付方式切换只影响视觉，卡表单始终在首屏（契约 §4.2） */
    HS.qa('.pay-opt').forEach(function (o) {
      o.addEventListener('click', function () {
        HS.qa('.pay-opt').forEach(function (x) { x.classList.remove('on'); });
        o.classList.add('on');
        var r = HS.q('input[type=radio]', o); if (r) r.checked = true;
      });
    });

    /* 记录购买事件结果（调试用，面板操作员也可在控制台看） */
    window.addEventListener('hs:purchase', function (e) {
      try { console.log('[hs] Purchase', e.detail); } catch (err) {}
    });

    /* 提交后页面绝不自己跳转（契约 §6.3）：这里不写任何 location 跳转 */
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
