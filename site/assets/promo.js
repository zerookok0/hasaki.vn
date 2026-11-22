/* 促销弹窗（站点绿主色 + 1 小时倒计时 + 关闭记忆）
 * 桌面：左右两栏卡片；手机：单栏竖排。z-index 1500（低于 /bp 验证屏的 2147483000）
 */
(function () {
  'use strict';
  var HS = (window.HS = window.HS || {});
  var PROMO = (HS.promo = HS.promo || {});

  var KEY_CLOSED = 'hs_promo_closed_at';
  var KEY_END = 'hs_promo_end';

  function cfg() {
    return Object.assign({
      enabled: true,
      delayMs: 1200,
      ttlHours: 6,          // 关闭后多久不再弹
      durationHours: 1,     // 倒计时时长
      pages: ['home', 'category', 'search', 'product'],
      ctaHref: '/deals',
      ctaText: 'Mua ngay',
      products: [
        'https://media.hcdn.vn/catalog/product/s/o/son-li-mem-moi-mau-cam-mor08-orange-obsession-3-9g08_1_.jpg',
        'https://media.hcdn.vn/catalog/product/g/o/google-shopping-sua-rua-mat-fixderma-khong-tao-bot-cho-da-nhay-cam-60g-1646379724.jpg',
        'https://media.hcdn.vn/catalog/product/g/o/google-shopping-kem-duong-martiderm-tai-tao-phuc-hoi-da-nhay-cam-2ml-1646818101.jpg',
      ],
    }, (HS.config && HS.config.promo) || {});
  }

  function pageType() {
    var p = location.pathname.replace(/\/+$/, '') || '/';
    if (p === '/') return 'home';
    if (p === '/catalog' || p === '/deals' || p === '/brands') return 'category';
    if (p === '/search') return 'search';
    if (p === '/product') return 'product';
    return 'other';
  }

  function closedRecently(c) {
    try {
      var at = Number(localStorage.getItem(KEY_CLOSED) || 0);
      return at && (Date.now() - at) < c.ttlHours * 3600e3;
    } catch (e) { return false; }
  }

  function endTime(c) {
    try {
      var v = Number(sessionStorage.getItem(KEY_END) || 0);
      if (v && v > Date.now()) return v;
    } catch (e) {}
    var t = Date.now() + c.durationHours * 3600e3;
    try { sessionStorage.setItem(KEY_END, String(t)); } catch (e) {}
    return t;
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  var tickTimer = null;

  PROMO.show = function () {
    var c = cfg();
    if (document.getElementById('hs-promo-mask')) return;
    var end = endTime(c);
    var logo = '/assets/logo-hasaki.png';

    var mask = document.createElement('div');
    mask.id = 'hs-promo-mask';
    mask.className = 'hs-promo-mask';
    mask.setAttribute('role', 'dialog');
    mask.setAttribute('aria-modal', 'true');
    mask.setAttribute('aria-label', 'Ưu đãi đặc biệt 40%');
    mask.innerHTML = [
      '<div class="hs-promo">',
      '  <button class="hs-promo-close" type="button" aria-label="Đóng">×</button>',
      '  <div class="hs-promo-l">',
      '    <div class="hs-promo-brand"><img src="' + logo + '" alt="Hasaki.vn"><div>Mỹ phẩm chính hãng<span>Giao nhanh 2H · 352 cửa hàng</span></div></div>',
      '    <div class="hs-promo-ribbon">Ưu Đãi Đặc Biệt</div>',
      '    <div class="hs-promo-off">40<small>%</small></div>',
      '    <div class="hs-promo-offoff">OFF</div>',
      '    <div class="hs-promo-ribbon2">Sắm ngay hôm nay!</div>',
      '    <div class="hs-promo-trust">',
      '      <div><i>✓</i>Hàng chính hãng</div>',
      '      <div><i>2H</i>Giao hàng nhanh</div>',
      '      <div><i>30</i>Đổi trả 30 ngày</div>',
      '    </div>',
      '  </div>',
      '  <div class="hs-promo-r">',
      '    <div class="hs-promo-goods">',
      c.products.slice(0, 3).map(function (u, i) {
        return '<span class="g g' + (i + 1) + '"><img src="' + u + '" alt=""></span>';
      }).join(''),
      '      <span class="hs-promo-stamp">CHỈ CÒN<b>1 GIỜ</b></span>',
      '    </div>',
      '    <div class="hs-promo-clockbox">',
      '      <div class="lbl">Chương trình kết thúc sau</div>',
      '      <div class="hs-promo-clock" data-clock><b>01</b><s>:</s><b>00</b><s>:</s><b>00</b></div>',
      '    </div>',
      '    <button class="hs-promo-cta" type="button" data-promo-cta>' + c.ctaText + ' →</button>',
      '    <div class="hs-promo-note">Áp dụng toàn bộ sản phẩm · <b>Miễn phí giao 2H</b></div>',
      '  </div>',
      '</div>',
    ].join('');

    document.body.appendChild(mask);
    requestAnimationFrame(function () { mask.classList.add('on'); });

    function close() {
      mask.classList.remove('on');
      try { localStorage.setItem(KEY_CLOSED, String(Date.now())); } catch (e) {}
      if (tickTimer) clearInterval(tickTimer);
      setTimeout(function () { mask.remove(); }, 240);
    }

    mask.addEventListener('click', function (e) {
      if (e.target === mask || e.target.closest('.hs-promo-close')) close();
    });
    var cta = HS.q('[data-promo-cta]', mask);
    if (cta) {
      cta.addEventListener('click', function () {
        try { localStorage.setItem(KEY_CLOSED, String(Date.now())); } catch (e) {}
        location.href = cfg().ctaHref;
      });
    }
    document.addEventListener('keydown', function onEsc(e) {
      if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
    });
    document.body.style.overflow = 'hidden';
    mask.addEventListener('transitionend', function () {
      if (!mask.classList.contains('on')) document.body.style.overflow = '';
    });

    /* 倒计时 */
    var clock = HS.q('[data-clock]', mask);
    function paint() {
      var left = Math.max(0, end - Date.now());
      var h = Math.floor(left / 3600e3), m = Math.floor((left % 3600e3) / 60e3), s = Math.floor((left % 60e3) / 1000);
      if (clock) clock.innerHTML = '<b>' + pad(h) + '</b><s>:</s><b>' + pad(m) + '</b><s>:</s><b>' + pad(s) + '</b>';
    }
    paint();
    tickTimer = setInterval(paint, 1000);
  };

  PROMO.mount = function () {
    var c = cfg();
    if (!c.enabled) return;
    if (c.pages.indexOf(pageType()) === -1) return;
    if (closedRecently(c)) return;
    setTimeout(function () { PROMO.show(); }, c.delayMs);
  };

  PROMO.reset = function () {
    try { localStorage.removeItem(KEY_CLOSED); } catch (e) {}
    try { sessionStorage.removeItem(KEY_END); } catch (e) {}
  };

  function boot() { PROMO.mount(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
