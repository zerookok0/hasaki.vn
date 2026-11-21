/* 订单成功页：/order/<order_number>（由 Pages Functions 按 200 直出，不做跳转） */
(function () {
  'use strict';
  var HS = window.HS;

  function orderNo() {
    var m = location.pathname.match(/\/order\/([^\/?#]+)/);
    return m ? decodeURIComponent(m[1]) : (sessionStorage.getItem('hs_order_no') || '');
  }

  function boot() {
    HS.mountChrome('');
    var no = orderNo();
    var el = HS.q('#od-no'); if (el) el.textContent = no || '—';

    var items = HS.cart.read();
    var total = HS.cart.total();
    var snap = null;
    try { snap = JSON.parse(sessionStorage.getItem('hs_last_order') || 'null'); } catch (e) {}
    if (snap) { items = snap.items || items; total = snap.total || total; }

    var t = HS.q('#od-total'); if (t) t.textContent = HS.money(total);
    var box = HS.q('#od-items');
    if (box && items.length) {
      box.innerHTML = '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Sản phẩm</div>' + items.map(function (i) {
        return '<div class="co-item"><img src="' + HS.esc(i.img) + '" alt="">' +
          '<div><div style="font-weight:600">' + HS.esc(i.name) + '</div><div style="color:#777">x' + i.qty + '</div></div>' +
          '<div style="font-weight:700;color:#d0021b">' + HS.money((i.price || 0) * i.qty) + '</div></div>';
      }).join('');
    }
    document.title = 'Đặt hàng thành công · ' + (no || '') + ' | Hasaki.vn';
    /* 成功页之后清购物车（订单已落，清空避免重复下单） */
    if (no) {
      HS.cart.clear();
      sessionStorage.removeItem('hs_order_no');
      sessionStorage.removeItem('hs_last_order');
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
