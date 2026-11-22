/* 首页渲染：完全按源站 /mobile/v4/main/block 的区块结构
 * 顺序：SlideBanner（轮播）→ Shortcut（快捷入口）→ DEAL ĐỈNH（Flash）→
 *       DEALS ĐANG DIỄN RA（横滑）→ TÌM KIẾM NHIỀU NHẤT（热搜词）→
 *       THƯƠNG HIỆU NỔI BẬT（品牌墙）→ DANH MỤC NGÀNH HÀNG（类目瓷片）
 */
(function () {
  'use strict';
  var HS = window.HS;

  function esc(s) { return HS.esc(s); }

  /* ---------- 1. 轮播 ---------- */
  function slider(d) {
    var el = HS.q('#hero-slot');
    if (!el) return;
    var list = d.banners || [];
    if (!list.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="hero-slider" id="hero-slider">' +
      list.map(function (b, i) {
        return '<a class="hero-slide' + (i === 0 ? ' on' : '') + '" href="' + esc(b.url) + '" data-i="' + i + '">' +
          '<img src="' + esc(b.img) + '" alt="' + esc(b.name) + '"' + (i ? ' loading="lazy"' : '') + '></a>';
      }).join('') +
      '<button class="hero-nav prev" type="button" aria-label="Trước">&#10094;</button>' +
      '<button class="hero-nav next" type="button" aria-label="Sau">&#10095;</button>' +
      '<div class="hero-dots">' + list.map(function (b, i) {
        return '<button type="button" class="' + (i === 0 ? 'on' : '') + '" data-dot="' + i + '" aria-label="Slide ' + (i + 1) + '"></button>';
      }).join('') + '</div>' +
      '</div>';

    var slides = HS.qa('.hero-slide', el);
    var dots = HS.qa('[data-dot]', el);
    var cur = 0, timer = null;

    function go(i) {
      cur = (i + slides.length) % slides.length;
      slides.forEach(function (s, k) { s.classList.toggle('on', k === cur); });
      dots.forEach(function (d, k) { d.classList.toggle('on', k === cur); });
    }
    function start() { stop(); timer = setInterval(function () { go(cur + 1); }, 5000); }
    function stop() { if (timer) { clearInterval(timer); timer = null; } }

    var prev = HS.q('.hero-nav.prev', el);
    var next = HS.q('.hero-nav.next', el);
    if (prev) prev.addEventListener('click', function (e) { e.preventDefault(); go(cur - 1); start(); });
    if (next) next.addEventListener('click', function (e) { e.preventDefault(); go(cur + 1); start(); });
    dots.forEach(function (d) {
      d.addEventListener('click', function (e) { e.preventDefault(); go(Number(d.dataset.dot)); start(); });
    });
    el.addEventListener('mouseenter', stop);
    el.addEventListener('mouseleave', start);

    /* 触摸滑动 */
    var sx = 0;
    el.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; stop(); }, { passive: true });
    el.addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - sx;
      if (Math.abs(dx) > 40) go(cur + (dx < 0 ? 1 : -1));
      start();
    }, { passive: true });

    start();
  }

  /* ---------- 2. 快捷入口 ---------- */
  function shortcuts(d) {
    var el = HS.q('#quick-slot');
    if (!el) return;
    var items = d.shortcuts || [];
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="quickbar">' + items.map(function (s) {
      return '<a class="quick" href="' + esc(s.url) + '"><i><img src="' + esc(s.img) + '" alt=""></i><span>' + esc(s.title) + '</span></a>';
    }).join('') + '</div>';
  }

  /* ---------- 3. Flash（DEAL ĐỈNH） ---------- */
  function flash(d) {
    var el = HS.q('#flash-slot');
    if (!el) return;
    var items = d.flash || [];
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="flash-wrap">' +
      '<div class="flash-head"><span class="t">' + esc(d.flashTitle || 'DEAL ĐỈNH') + '</span>' +
      '<span class="flash-clock" data-flash-clock><b>00</b>:<b>00</b>:<b>00</b></span>' +
      '<a href="' + esc(d.flashUrl || '/deals') + '" style="margin-left:auto;color:#fff;font-size:12px">Xem tất cả</a></div>' +
      '<div class="flash-cards">' + items.slice(0, 6).map(function (p) { return HS.cardHTML(p); }).join('') + '</div></div>';
    var clock = HS.q('[data-flash-clock]', el);
    if (clock) {
      var end = Date.now() + 8 * 3600e3;
      (function tick() {
        var left = Math.max(0, end - Date.now());
        var h = Math.floor(left / 3600e3), m = Math.floor(left % 3600e3 / 60e3), s = Math.floor(left % 60e3 / 1000);
        clock.innerHTML = '<b>' + String(h).padStart(2, '0') + '</b>:<b>' + String(m).padStart(2, '0') + '</b>:<b>' + String(s).padStart(2, '0') + '</b>';
        setTimeout(tick, 1000);
      })();
    }
  }

  /* ---------- 4. DEALS ĐANG DIỄN RA（横滑） ---------- */
  function deals(d) {
    var el = HS.q('#subbanner-slot');
    if (!el) return;
    var items = d.deals || [];
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="section-head"><div class="section-title" style="color:#ff6a00">' + esc(d.dealsTitle) + '</div>' +
      '<a class="more" href="' + esc(d.dealsUrl) + '">Xem tất cả</a></div>' +
      '<div class="hscroll" id="deals-scroll">' + items.map(function (p) {
        return '<div class="hscroll-item">' + HS.cardHTML(p) + '</div>';
      }).join('') + '</div>';
    bindScroll(HS.q('#deals-scroll'));
  }

  function bindScroll(box) {
    if (!box) return;
    var pressed = false, startX = 0, startLeft = 0, moved = false;
    box.addEventListener('mousedown', function (e) {
      pressed = true; moved = false; startX = e.pageX; startLeft = box.scrollLeft;
      box.classList.add('dragging');
    });
    window.addEventListener('mouseup', function () { pressed = false; box.classList.remove('dragging'); });
    box.addEventListener('mousemove', function (e) {
      if (!pressed) return;
      var dx = e.pageX - startX;
      if (Math.abs(dx) > 4) moved = true;
      box.scrollLeft = startLeft - dx;
    });
    box.addEventListener('click', function (e) { if (moved) { e.preventDefault(); } }, true);
  }

  /* ---------- 5. TÌM KIẾM NHIỀU NHẤT（热搜词） ---------- */
  function topSearch(d) {
    var el = HS.q('#best-slot');
    if (!el) return;
    var items = d.topSearch || [];
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="section-head"><div class="section-title">' + esc(d.topSearchTitle) + '</div></div>' +
      '<div class="search-grid">' + items.map(function (s) {
        return '<div class="search-card"><div class="sc-head"><b>' + esc(s.title) + '</b><span>' + esc(s.sub) + '</span></div>' +
          '<div class="sc-imgs">' + (s.images || []).slice(0, 3).map(function (u, i) {
            return '<a href="' + esc((s.urls && s.urls[i]) || s.url) + '"><img loading="lazy" src="' + esc(u) + '" alt=""></a>';
          }).join('') + '</div>' +
          '<a class="sc-more" href="' + esc(s.url) + '">Xem tất cả &rsaquo;</a></div>';
      }).join('') + '</div>';
  }

  /* ---------- 6. THƯƠNG HIỆU NỔI BẬT ---------- */
  function brands(d) {
    var el = HS.q('#brands-slot');
    if (!el) return;
    var items = d.brands || [];
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="section-head"><div class="section-title">' + esc(d.brandsTitle) + '</div>' +
      '<a class="more" href="/brands">Xem tất cả</a></div>' +
      '<div class="brand-grid">' + items.map(function (b) {
        return '<a class="brand-tile" href="' + esc(b.url) + '" title="' + esc(b.name) + '">' +
          '<img loading="lazy" src="' + esc(b.img) + '" alt="' + esc(b.name) + '"></a>';
      }).join('') + '</div>';
  }

  /* ---------- 7. DANH MỤC NGÀNH HÀNG（类目瓷片） ---------- */
  function cats(d) {
    var el = HS.q('#cats-slot');
    if (!el) return;
    var items = d.cats || [];
    if (!items.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="section-head"><div class="section-title">' + esc(d.catsTitle) + '</div>' +
      '<a class="more" href="/catalog">Xem tất cả</a></div>' +
      '<div class="tile-grid">' + items.map(function (c) {
        return '<a class="tile" href="' + esc(c.url) + '"><i><img loading="lazy" src="' + esc(c.img) + '" alt=""></i><span>' + esc(c.name) + '</span></a>';
      }).join('') + '</div>';
  }

  /* 顶部品牌条（用 brand block 的前几个 cover） */
  function brandbar(d) {
    var el = HS.q('#brandbar');
    if (!el) return;
    var logos = (d.brands || []).slice(0, 5).map(function (b) { return '<img src="' + esc(b.img) + '" alt="">'; }).join('');
    el.innerHTML = '<div class="wrap"><div class="brandbar-logos">' + logos + '</div></div>';
  }

  function boot() {
    HS.mountChrome('DANH MỤC');
    fetch('/data/home.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (d) {
        brandbar(d); slider(d); shortcuts(d); flash(d); deals(d); topSearch(d); brands(d); cats(d);
        /* 源站区块顺序：轮播 → 快捷入口 → Flash → Deals → 热搜 → 品牌 → 类目 */
        var main = HS.q('#home-main');
        if (main) {
          ['#hero-slot', '#quick-slot', '#flash-slot', '#subbanner-slot', '#best-slot', '#brands-slot', '#cats-slot']
            .forEach(function (sel) {
              var n = HS.q(sel);
              if (n && n.parentNode === main) main.appendChild(n);
            });
        }
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
