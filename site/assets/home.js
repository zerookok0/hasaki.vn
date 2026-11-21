/* 首页渲染：全部数据来自 /data/home.json（构建期由抓取结果生成） */
(function () {
  'use strict';
  var HS = window.HS;
  var ICONS = {
    deal: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 12v7a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-7M2 7h20v5H2zM12 7v13"/></svg>',
    phone: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="3"/><path d="M11 18h2"/></svg>',
    speaker: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="2" width="14" height="20" rx="3"/><circle cx="12" cy="15" r="3"/><circle cx="12" cy="7" r="1.4"/></svg>',
    clean: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3h4l2 6H6z"/><path d="M7 9h10l1 12H6z"/></svg>',
    bag: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 8h14l-1 12H6z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg>',
    baby: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="9" r="5"/><path d="M6 20c1.5-3 3.5-4 6-4s4.5 1 6 4"/></svg>',
    clock: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v6l4 2"/></svg>',
    spark: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3l2.2 6.2L21 12l-6.8 2.8L12 21l-2.2-6.2L3 12l6.8-2.8z"/></svg>',
  };

  function brandbar(d) {
    var el = HS.q('#brandbar');
    if (!el) return;
    var logos = (d.brandbar || []).map(function (u) { return '<img src="' + HS.esc(u) + '" alt="">'; }).join('');
    el.innerHTML = '<div class="wrap">' +
      '<div class="brandbar-logos">' + logos + '</div>' +
      '<div class="brandbar-promo">' + (d.promo ? '<img src="' + HS.esc(d.promo) + '" alt="Khuyến mãi">' : '') + '</div>' +
      '</div>';
  }

  function hero(d) {
    var el = HS.q('#hero-slot');
    if (!el) return;
    var main = (d.hero || []).slice(0, 3).map(function (u) {
      return '<a class="hero-tile" href="/catalog"><img src="' + HS.esc(u) + '" alt=""></a>';
    }).join('');
    var side = (d.heroSide || []).slice(0, 2).map(function (u) {
      return '<a class="hero-tile" href="/catalog"><img src="' + HS.esc(u) + '" alt=""></a>';
    }).join('');
    el.innerHTML = '<div class="hero-grid mt-12">' + main + '<div style="display:grid;grid-template-rows:1fr 1fr;gap:8px">' + side + '</div></div>';
  }

  function quick(d) {
    var el = HS.q('#quick-slot');
    if (!el) return;
    var items = d.quick || [];
    el.innerHTML = '<div class="quickbar">' + items.map(function (q) {
      return '<a class="quick" href="' + HS.esc(q.href || '/catalog') + '"><i>' + (ICONS[q.icon] || ICONS.spark) + '</i><span>' + HS.esc(q.label) + '</span></a>';
    }).join('') + '</div>';
  }

  function flash(d) {
    var el = HS.q('#flash-slot');
    if (!el) return;
    var cards = (d.flash || []).map(function (p) { return HS.cardHTML(p); }).join('');
    el.innerHTML = '<div class="flash-wrap">' +
      '<div class="flash-head"><span class="t">Flash deals</span>' +
      '<span class="flash-clock" data-flash-clock><b>00</b>:<b>00</b>:<b>00</b></span>' +
      '<a href="/deals" style="margin-left:auto;color:#fff;font-size:12px">Xem tất cả</a></div>' +
      '<div class="flash-cards">' + cards + '</div></div>';
    /* 倒计时（8 小时内循环） */
    var el2 = HS.q('[data-flash-clock]', el);
    if (el2) {
      var end = Date.now() + 8 * 3600e3;
      (function tick() {
        var left = Math.max(0, end - Date.now());
        var h = Math.floor(left / 3600e3), m = Math.floor(left % 3600e3 / 60e3), s = Math.floor(left % 60e3 / 1000);
        el2.innerHTML = '<b>' + String(h).padStart(2, '0') + '</b>:<b>' + String(m).padStart(2, '0') + '</b>:<b>' + String(s).padStart(2, '0') + '</b>';
        setTimeout(tick, 1000);
      })();
    }
  }

  function subBanners(d) {
    var el = HS.q('#subbanner-slot');
    if (!el) return;
    var items = d.subBanners || [];
    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(' + Math.min(3, items.length || 1) + ',1fr);gap:10px">' +
      items.map(function (u) { return '<a href="/catalog" class="hero-tile"><img src="' + HS.esc(u) + '" alt="" style="height:140px"></a>'; }).join('') +
      '</div>';
  }

  function cats(d) {
    var el = HS.q('#cats-slot');
    if (!el) return;
    var items = d.cats || [];
    el.innerHTML = '<div class="section-head"><div class="section-title">Danh mục</div><a class="more" href="/catalog">Xem tất cả</a></div>' +
      '<div class="tile-grid">' + items.map(function (c) {
        return '<a class="tile" href="/catalog?slug=' + encodeURIComponent(c.slug) + '"><i><img loading="lazy" src="' + HS.esc(c.img) + '" alt=""></i><span>' + HS.esc(c.name) + '</span></a>';
      }).join('') + '</div>';
  }

  function brands(d) {
    var el = HS.q('#brands-slot');
    if (!el) return;
    var items = d.brands || [];
    el.innerHTML = '<div class="section-head"><div class="section-title">Thương hiệu</div><a class="more" href="/brands">Xem tất cả</a></div>' +
      '<div class="brand-grid">' + items.map(function (b) {
        return '<a class="brand-tile" href="/search?q=' + encodeURIComponent(b.name) + '"><img loading="lazy" src="' + HS.esc(b.img) + '" alt="' + HS.esc(b.name) + '"></a>';
      }).join('') + '</div>';
  }

  function best(d) {
    var el = HS.q('#best-slot');
    if (!el) return;
    var items = d.best || [];
    el.innerHTML = '<div class="section-head"><div class="section-title">Bán chạy</div><a class="more" href="/catalog?sort=best">Xem tất cả</a></div>' +
      '<div class="rank-grid">' + items.map(function (p) {
        return '<a class="rank-card" href="/product?id=' + p.id + '">' +
          '<div class="n">' + (p.rateCount ? p.rateCount + ' đánh giá' : (p.popular ? HS.moneyPlain(p.popular) + ' đã bán' : 'Chính hãng')) + '</div>' +
          '<img loading="lazy" src="' + HS.esc(p.img) + '" alt="">' +
          '<div class="name">' + HS.esc(p.name) + '</div>' +
          '<div class="card-price"><span class="price-now">' + HS.money(p.sale) + '</span></div></a>';
      }).join('') + '</div>';
  }

  function topsearch(d) {
    var el = HS.q('#topsearch-slot');
    if (!el) return;
    var items = d.topSearch || [];
    el.innerHTML = '<div class="section-head"><div class="section-title">Top tìm kiếm</div></div>' +
      '<div class="grid-4">' + items.map(function (p) {
        return '<a class="card" href="/product?id=' + p.id + '"><div class="card-media"><img loading="lazy" src="' + HS.esc(p.img) + '" alt=""></div>' +
          '<div class="card-body"><div class="card-price"><span class="price-now">' + HS.money(p.sale) + '</span></div>' +
          '<div class="card-name">' + HS.esc(p.name) + '</div></div></a>';
      }).join('') + '</div>';
  }

  function boot() {
    HS.mountChrome('DANH MỤC');
    fetch('/data/home.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (d) {
        brandbar(d); hero(d); quick(d); flash(d); subBanners(d); cats(d); brands(d); best(d); topsearch(d);
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
