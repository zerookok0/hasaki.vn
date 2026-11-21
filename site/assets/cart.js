/* 购物车页 */
(function () {
  'use strict';
  var HS = window.HS;

  function render() {
    var items = HS.cart.read();
    var rows = HS.q('#cart-rows');
    var cnt = HS.q('#cart-count-txt');
    if (cnt) cnt.textContent = items.length ? (items.length + ' sản phẩm') : '';
    if (!items.length) {
      rows.innerHTML = '<div class="empty">Giỏ hàng đang trống.<br><a class="btn btn-green btn-sm" href="/catalog" style="margin-top:14px">Mua sắm ngay</a></div>';
    } else {
      rows.innerHTML = items.map(function (i) {
        return '<div class="cart-row" data-id="' + i.id + '">' +
          '<a href="/product?id=' + i.id + '"><img src="' + HS.esc(i.img) + '" alt=""></a>' +
          '<div><a class="nm" href="/product?id=' + i.id + '">' + HS.esc(i.name) + '</a>' +
          '<div class="br">' + HS.esc(i.brand || '') + '</div>' +
          '<div style="margin-top:4px"><span class="price-now">' + HS.money(i.price) + '</span> ' +
          (i.market > i.price ? '<span class="price-old">' + HS.money(i.market) + '</span>' : '') + '</div></div>' +
          '<div class="center gap-8"><span class="qty"><button data-q="-1">−</button>' +
          '<input value="' + i.qty + '" data-qty><button data-q="1">+</button></span></div>' +
          '<div style="text-align:right;font-weight:700;color:#d0021b">' + HS.money(i.price * i.qty) + '</div>' +
          '<button class="btn btn-sm" data-rm title="Xóa" style="background:transparent;color:#999;font-size:18px">×</button>' +
          '</div>';
      }).join('');
    }
    var market = items.reduce(function (s, i) { return s + (Number(i.market) || 0) * i.qty; }, 0);
    var total = HS.cart.total();
    HS.q('#sum-market').textContent = HS.money(market);
    HS.q('#sum-save').textContent = market > total ? '-' + HS.money(market - total) : '0 ₫';
    HS.q('#sum-total').textContent = HS.money(total);

    HS.qa('[data-q]', rows).forEach(function (b) {
      b.addEventListener('click', function () {
        var row = b.closest('.cart-row');
        var id = row.dataset.id;
        var cur = HS.cart.read().filter(function (x) { return String(x.id) === id; })[0];
        HS.cart.setQty(id, (Number(cur && cur.qty) || 1) + Number(b.dataset.q));
        render();
      });
    });
    HS.qa('[data-qty]', rows).forEach(function (inp) {
      inp.addEventListener('change', function () {
        var row = inp.closest('.cart-row');
        HS.cart.setQty(row.dataset.id, Number(inp.value) || 1);
        render();
      });
    });
    HS.qa('[data-rm]', rows).forEach(function (b) {
      b.addEventListener('click', function () {
        HS.cart.remove(b.closest('.cart-row').dataset.id);
        render();
      });
    });
  }

  function boot() { HS.mountChrome(''); render(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
