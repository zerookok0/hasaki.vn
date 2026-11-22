/* Hasaki 复刻站 · 核心脚本（配置 / 定价 / 购物车 / 页头页脚 / 数据） */
(function () {
  'use strict';

  var HS = (window.HS = window.HS || {});

  /* ---------------- 配置 ---------------- */
  HS.config = {
    siteName: 'Hasaki.vn',
    currency: 'VND',
    discount: 0.6,             // 全站按原标价 6 折
    fbPixelId: '000000000000000', // ← 填 Facebook Pixel ID 即启用
    pixel: { pageView: true, viewContent: true, addToCart: true, initiateCheckout: true, purchase: true },
    purchaseDedupeHours: 24,
    /* 促销弹窗（站点绿主色 + 1 小时倒计时）*/
    promo: {
      enabled: true,
      delayMs: 1200,
      ttlHours: 6,
      durationHours: 1,
      pages: ['home', 'category', 'search', 'product'],
      ctaHref: '/deals',
      ctaText: 'Mua ngay',
    },
    freeShipFrom: 249000,
    lang: 'vi',
    phone: '1800 6324',
  };

  /* ---------------- 工具 ---------------- */
  HS.q = function (s, r) { return (r || document).querySelector(s); };
  HS.qa = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  HS.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  HS.param = function (k, d) {
    var m = new RegExp('[?&]' + k + '=([^&]*)').exec(location.search);
    return m ? decodeURIComponent(m[1].replace(/\+/g, ' ')) : (d || '');
  };
  HS.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* 越南盾格式化：342000 -> "342.000 ₫" */
  HS.money = function (n) {
    n = Math.round(Number(n) || 0);
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
  };
  HS.moneyPlain = function (n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  };

  /* 唯一算价入口：原标价 -> 6 折售价（整数越南盾，取整到 100） */
  HS.salePrice = function (marketPrice) {
    var m = Number(marketPrice) || 0;
    if (m <= 0) return 0;
    return Math.round((m * HS.config.discount) / 100) * 100;
  };
  HS.offPercent = function (market, sale) {
    if (!market || !sale || market <= sale) return 0;
    return Math.round((1 - sale / market) * 100);
  };

  /* ---------------- toast ---------------- */
  HS.toast = function (msg) {
    var el = HS.q('#hs-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'hs-toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(HS._tt);
    HS._tt = setTimeout(function () { el.classList.remove('on'); }, 2200);
  };

  /* ---------------- 购物车（localStorage 快照） ---------------- */
  var CART_KEY = 'hs_cart_v1';
  HS.cart = {
    read: function () {
      try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); } catch (e) { return []; }
    },
    write: function (items) {
      try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) {}
      /* 同步一份精简快照到 cookie，供 /api/cart 双保险（契约 §5.2） */
      try {
        var slim = items.slice(0, 8).map(function (i) {
          return { name: String(i.name || '').slice(0, 40), qty: i.qty, price: i.price };
        });
        document.cookie = 'hs_cart=' + encodeURIComponent(JSON.stringify(slim)) + '; path=/; SameSite=Lax';
        if (window.__BP_CART__ && window.__BP_CART__.order_number) {
          document.cookie = 'hs_order=' + encodeURIComponent(window.__BP_CART__.order_number) + '; path=/; SameSite=Lax';
        }
      } catch (e) {}
      HS.cart.badge();
      document.dispatchEvent(new CustomEvent('hs:cart-change', { detail: items }));
    },
    count: function () {
      return HS.cart.read().reduce(function (s, i) { return s + (Number(i.qty) || 0); }, 0);
    },
    total: function () {
      return HS.cart.read().reduce(function (s, i) { return s + (Number(i.price) || 0) * (Number(i.qty) || 0); }, 0);
    },
    has: function (id) {
      return HS.cart.read().some(function (i) { return String(i.id) === String(id); });
    },
    add: function (p, qty) {
      qty = Math.max(1, Number(qty) || 1);
      var items = HS.cart.read();
      var hit = null;
      for (var i = 0; i < items.length; i++) if (String(items[i].id) === String(p.id)) hit = items[i];
      if (hit) hit.qty = Math.min(99, (Number(hit.qty) || 1) + qty);
      else items.push({
        id: p.id, name: p.name, brand: p.brandName || (p.brand && p.brand.name) || '',
        img: p.img || (p.gallery && p.gallery[0]) || '', price: p.sale || HS.salePrice(p.market_price || p.price),
        market: p.market_price || p.price || 0, slug: p.slug || '', qty: qty,
      });
      HS.cart.write(items);
      HS.pixel.addToCart(p, qty);
      return items;
    },
    setQty: function (id, qty) {
      var items = HS.cart.read();
      qty = Math.max(0, Math.min(99, Number(qty) || 0));
      for (var i = items.length - 1; i >= 0; i--) {
        if (String(items[i].id) === String(id)) { if (qty === 0) items.splice(i, 1); else items[i].qty = qty; }
      }
      HS.cart.write(items);
      return items;
    },
    remove: function (id) { return HS.cart.setQty(id, 0); },
    clear: function () { HS.cart.write([]); },
    badge: function () {
      var n = HS.cart.count();
      HS.qa('[data-cart-count]').forEach(function (el) {
        el.textContent = n;
        el.style.display = n > 0 ? '' : 'none';
      });
    },
  };

  /* ---------------- 数据加载 ---------------- */
  var bucketOf = function (id) { return Math.floor((Number(id) || 0) / 500); };
  var prodCache = {};
  HS.loadProduct = function (id) {
    var b = bucketOf(id);
    if (!prodCache[b]) {
      prodCache[b] = fetch('/data/p/' + b + '.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
    }
    return prodCache[b].then(function (map) { return map[String(id)] || null; });
  };
  HS.loadProducts = function (ids) {
    var buckets = {};
    ids.forEach(function (id) { buckets[bucketOf(id)] = 1; });
    var jobs = Object.keys(buckets).map(function (b) {
      if (!prodCache[b]) {
        prodCache[b] = fetch('/data/p/' + b + '.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; });
      }
      return prodCache[b];
    });
    return Promise.all(jobs).then(function (maps) {
      var out = {};
      maps.forEach(function (m) { Object.keys(m).forEach(function (k) { out[k] = m[k]; }); });
      return ids.map(function (id) { return out[String(id)] || null; }).filter(Boolean);
    });
  };
  var indexPromise = null;
  HS.loadIndex = function () {
    if (!indexPromise) {
      indexPromise = fetch('/data/index.json').then(function (r) { return r.ok ? r.json() : { rows: [] }; }).catch(function () { return { rows: [] }; });
    }
    return indexPromise;
  };
  /** index.json 行解包：[id,name,brand,market,sale,img,cat,rate,rateCount,popular,dealPercent] */
  HS.rowToProduct = function (r) {
    return {
      id: r[0], name: r[1], brandName: r[2], market_price: r[3], sale: r[4],
      img: r[5], cat: r[6], rate: r[7], rateCount: r[8], popular: r[9], dealPercent: r[10] || 0,
      slug: HS.slugOf(r[1], r[0]),
    };
  };
  HS.slugOf = function (name, id) {
    var s = String(name || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
    return s + '-' + id;
  };

  /* ---------------- 页头 / 页脚 / cookie ---------------- */
  HS.mountChrome = function (active) {
    var head = HS.q('#site-header');
    if (head) head.innerHTML = HS.headerHTML(active);
    var foot = HS.q('#site-footer');
    if (foot) foot.innerHTML = HS.footerHTML();
    HS.mountBrandbar();
    HS.cart.badge();
    HS.bindSearch();
    HS.bindMobileMenu();
    HS.cookieBar();
    HS.loadNavCats();
  };

  /* 顶部品牌条（首页由 home.js 覆盖，其余页面用同一份数据） */
  HS.mountBrandbar = function () {
    var el = HS.q('#brandbar');
    if (!el) return;
    fetch('/data/home.json').then(function (r) { return r.ok ? r.json() : {}; }).catch(function () { return {}; })
      .then(function (d) {
        var logos = (d.brandbar || []).slice(0, 6).map(function (u) { return '<img src="' + HS.esc(u) + '" alt="">'; }).join('');
        el.innerHTML = '<div class="wrap"><div class="brandbar-logos">' + logos + '</div>' +
          '<div class="brandbar-promo">' + (d.promo ? '<img src="' + HS.esc(d.promo) + '" alt="">' : '') + '</div></div>';
      });
  };

  HS.headerHTML = function (active) {
    var nav = [
      ['DANH MỤC', '/catalog'],
      ['HASAKI DEALS', '/deals'],
      ['HOT DEALS', '/deals'],
      ['THƯƠNG HIỆU', '/brands'],
      ['HÀNG MỚI VỀ', '/catalog?slug=new-arrivals'],
      ['BÁN CHẠY', '/catalog?slug=best-sellers'],
      ['CLINIC & SPA', '/policy?slug=clinic'],
      ['DERMAHAIR', '/policy?slug=dermahair'],
    ].map(function (n, idx) {
      if (idx === 0) {
        /* 首页顶部「DANH MỤC」带分类下拉（一级 + 二级） */
        return '<div class="nav-item nav-cat"><a href="' + n[1] + '"' + (active === n[0] ? ' class="active"' : '') + '>' + n[0] + ' &#9662;</a>' +
          '<div class="nav-drop" id="nav-drop"></div></div>';
      }
      return '<a href="' + n[1] + '"' + (active === n[0] ? ' class="active"' : '') + '>' + n[0] + '</a>';
    }).join('');

    return [
      '<div class="hs-header">',
      '  <div class="wrap head-top">',
      '    <a class="hs-logo" href="/" aria-label="Hasaki.vn"><img src="/assets/logo-hasaki.png" alt="Hasaki.vn" width="180" height="41"></a>',
      '    <div class="hs-slogan">Tiết kiệm hơn.<br>Mọi lúc.</div>',
      '    <form class="hs-search" id="hs-search-form" role="search">',
      '      <input id="hs-q" type="search" name="q" placeholder="Tìm sản phẩm, thương hiệu bạn mong muốn..." autocomplete="off">',
      '      <button type="submit" aria-label="Tìm kiếm">',
      '        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>',
      '      </button>',
      '    </form>',
      '    <div class="hs-head-links">',
      '      <a class="hs-head-link" href="/login" data-auth-slot>',
      '        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.5"></circle><path d="M4.5 20c1.5-3.5 4.5-5 7.5-5s6 1.5 7.5 5"></path></svg>',
      '        <span><b data-auth-name>Đăng nhập / Đăng ký</b><span data-auth-sub>Tài khoản</span></span>',
      '      </a>',
      '      <a class="hs-head-link" href="/policy?slug=branch"><b>Hệ thống<br>cửa hàng</b></a>',
      '      <a class="hs-head-link" href="/policy?slug=guarantee"><b>Bảo<br>hành</b></a>',
      '      <a class="hs-head-link" href="/policy?slug=support"><b>Hỗ trợ<br>khách hàng</b></a>',
      '      <a class="hs-cart" href="/cart" aria-label="Giỏ hàng">',
      '        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 4h2l2.5 11h11L21 8H6"></path><circle cx="9.5" cy="19" r="1.4"></circle><circle cx="18" cy="19" r="1.4"></circle></svg>',
      '        <span class="badge" data-cart-count style="display:none">0</span>',
      '      </a>',
      '    </div>',
      '  </div>',
      '  <div class="hs-nav"><div class="wrap">' + nav,
      '    <div class="nav-right"><span>Tải ứng dụng</span><span>&#128205; Thành phố Hồ Chí Minh</span></div>',
      '  </div></div>',
      '</div>',
    ].join('');
  };

  HS.footerHTML = function () {
    var col = function (title, links) {
      return '<div class="foot-col"><h4>' + title + '</h4>' + links.map(function (l) {
        return '<a href="' + l[1] + '">' + l[0] + '</a>';
      }).join('') + '</div>';
    };
    return [
      '<div class="hs-footer"><div class="wrap">',
      '  <div class="foot-trust">',
      '    <div class="it"><i>₫</i><span>Thanh toán khi nhận hàng</span></div>',
      '    <div class="it"><i>2H</i><span>Giao nhanh miễn phí 2H</span></div>',
      '    <div class="it"><i>30</i><span>30 ngày đổi trả miễn phí</span></div>',
      '    <div class="it"><b style="font-size:18px">HOTLINE ' + HS.config.phone + '</b></div>',
      '  </div>',
      '  <div class="foot-cols">',
      col('HỖ TRỢ KHÁCH HÀNG', [
        ['Hotline: 1800 6324', '/policy?slug=support'],
        ['Các câu hỏi thường gặp', '/policy?slug=faq'],
        ['Gửi yêu cầu hỗ trợ', '/policy?slug=support'],
        ['Hướng dẫn đặt hàng', '/policy?slug=order-guide'],
        ['Phương thức thanh toán', '/policy?slug=payment'],
        ['Phương thức vận chuyển', '/policy?slug=shipping'],
        ['Chính sách đổi trả', '/policy?slug=return'],
      ]),
      col('VỀ HASAKI.VN', [
        ['Giới thiệu Hasaki.vn', '/policy?slug=about'],
        ['Chính sách bảo mật', '/policy?slug=privacy'],
        ['Điều khoản sử dụng', '/policy?slug=terms'],
        ['Hasaki cẩm nang', '/policy?slug=handbook'],
        ['Tuyển dụng', '/policy?slug=career'],
        ['Liên hệ', '/policy?slug=contact'],
      ]),
      col('HỢP TÁC & LIÊN KẾT', [
        ['Hasaki Clinic', '/policy?slug=clinic'],
        ['Dermahair', '/policy?slug=dermahair'],
        ['Facebook', 'https://facebook.com/hasaki.vn'],
        ['Instagram', 'https://instagram.com/hasaki.vn'],
        ['TikTok', 'https://tiktok.com/@hasaki.vn'],
      ]),
      col('THANH TOÁN', [
        ['Master Card', '/policy?slug=payment'],
        ['ATM Card', '/policy?slug=payment'],
        ['Visa Card', '/policy?slug=payment'],
        ['Ví điện tử', '/policy?slug=payment'],
      ]),
      '  </div>',
      '  <div class="foot-about">',
      '    <h5>HASAKI.VN - TIẾT KIỆM HƠN. MỌI LÚC.</h5>',
      '    <p>Hasaki là hệ thống bán lẻ mỹ phẩm chính hãng và dịch vụ chăm sóc sắc đẹp chuyên sâu với mạng lưới cửa hàng trải dài trên toàn quốc. Từ nền tảng chuyên về làm đẹp, Hasaki.vn không ngừng phát triển thành hệ sinh thái mua sắm đa dạng, đáp ứng nhu cầu từ chăm sóc cá nhân đến tiêu dùng hằng ngày, với các ngành hàng như Mỹ phẩm &amp; Chăm sóc cá nhân, Gia dụng &amp; Đời sống, Điện gia dụng, Điện thoại &amp; Phụ kiện điện tử, Sản phẩm cho Bé và Thời trang.</p>',
      '    <p style="margin-top:10px">Hasaki hiện là đối tác phân phối và bán lẻ của hàng loạt thương hiệu trong nước và quốc tế thuộc nhiều ngành hàng: La Roche-Posay, Eucerin, L\'Oréal, Bioderma, Kiehl\'s, Shu Uemura, Klairs, Maybelline, Vichy, Skin1004, Cocoon, Cetaphil, Anessa, SVR, Paula\'s Choice, Vaseline, Hada Labo, Shiseido, Obagi, Cosrx, Laneige, Round Lab, Celimax và nhiều thương hiệu khác.</p>',
      '  </div>',
      '</div>',
      '<div class="foot-bottom"><div class="wrap"><span>© 2026 Hasaki.vn — Bản mô phỏng phục vụ kiểm thử nội bộ.</span><span>Hotline ' + HS.config.phone + ' · 08-22h kể cả T7, CN</span></div></div>',
      '</div>',
    ].join('');
  };

  HS.bindSearch = function () {
    var f = HS.q('#hs-search-form');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = (HS.q('#hs-q').value || '').trim();
      if (q) location.href = '/search?q=' + encodeURIComponent(q);
    });
  };
  HS.bindMobileMenu = function () {
    HS.qa('[data-toggle-side]').forEach(function (b) {
      b.addEventListener('click', function () {
        var s = HS.q('.side');
        if (s) s.classList.toggle('open');
      });
    });
    /* 触屏设备：点「DANH MỤC」展开分类下拉（桌面仍是 hover） */
    var catNav = HS.q('.nav-item.nav-cat');
    if (catNav) {
      var link = HS.q('a', catNav);
      if (link) link.addEventListener('click', function (e) {
        if (window.matchMedia && window.matchMedia('(hover: none)').matches) {
          e.preventDefault();
          catNav.classList.toggle('open');
        }
      });
      document.addEventListener('click', function (e) {
        if (!catNav.contains(e.target)) catNav.classList.remove('open');
      });
    }
  };

  HS.cookieBar = function () {
    if (localStorage.getItem('hs_cookie_ok')) return;
    var bar = document.createElement('div');
    bar.className = 'cookie-bar';
    bar.innerHTML = '<div class="wrap center between gap-16">' +
      '<p>Chúng tôi quan tâm đến quyền riêng tư của bạn. Chúng tôi sử dụng các cookie cần thiết để đảm bảo chức năng cần thiết của website và cung cấp các tính năng cần thiết để đảm bảo trải nghiệm duyệt web của bạn. Chúng tôi cũng sử dụng cookie không thiết yếu để hiểu cách khách truy cập tương tác với trang web của chúng tôi, cải thiện trải nghiệm người dùng và cung cấp dịch vụ tốt hơn.</p>' +
      '<div class="acts"><button class="btn btn-outline btn-sm" data-cookie="no">Từ chối</button><button class="btn btn-green btn-sm" data-cookie="yes">Đồng ý</button></div></div>';
    document.body.appendChild(bar);
    HS.qa('[data-cookie]', bar).forEach(function (b) {
      b.addEventListener('click', function () {
        localStorage.setItem('hs_cookie_ok', b.dataset.cookie);
        bar.remove();
      });
    });
  };

  HS.loadNavCats = function () {
    fetch('/data/categories.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
      .then(function (cats) {
        HS.categories = cats;
        var drop = HS.q('#nav-drop');
        if (drop && Array.isArray(cats) && cats.length) {
          var l1 = cats.filter(function (c) { return c.level === 1; }).slice(0, 12);
          drop.innerHTML = l1.map(function (c) {
            var kids = cats.filter(function (k) { return k.parent === c.id && k.level === 2; }).slice(0, 8);
            return '<div class="g-group"><a class="g" href="/catalog?slug=' + encodeURIComponent(c.slug) + '">' + HS.esc(c.name) + '</a>' +
              kids.map(function (k) {
                return '<a href="/catalog?slug=' + encodeURIComponent(k.slug) + '">' + HS.esc(k.name) +
                  '<span class="n">' + (k.count || 0) + '</span></a>';
              }).join('') + '</div>';
          }).join('');
        }
        document.dispatchEvent(new CustomEvent('hs:cats', { detail: cats }));
      });
  };

  /* ---------------- 卡片渲染 ---------------- */
  HS.cardHTML = function (p) {
    var sale = p.sale || HS.salePrice(p.market_price);
    var market = p.market_price || 0;
    var off = HS.offPercent(market, sale) || p.off || 0;
    var rating = p.rate || (p.rating && p.rating.avg) || 0;
    var rc = p.rateCount || (p.rating && p.rating.total) || 0;
    var sold = p.popular || p.bought_count || 0;
    var href = '/product?id=' + p.id;
    var prog = p.dealPercent || 0;
    return [
      '<a class="card" href="' + href + '" data-card="' + p.id + '">',
      '  <div class="card-media">',
      off ? '    <span class="card-off">-' + off + '%</span>' : '',
      '    <img loading="lazy" src="' + HS.esc(p.img || '/assets/placeholder.svg') + '" alt="' + HS.esc(p.name) + '">',
      '  </div>',
      '  <div class="card-body">',
      '    <div class="card-price"><span class="price-now">' + HS.money(sale) + '</span>',
      market > sale ? '<span class="price-old">' + HS.money(market) + '</span>' : '', '</div>',
      '    <div class="card-brand">' + HS.esc(p.brandName || '') + '</div>',
      '    <div class="card-name">' + HS.esc(p.name) + '</div>',
      prog ? '<div class="progress"><i style="width:' + Math.min(100, prog) + '%"></i></div><div class="progress-label">Đã bán ' + prog + '%</div>' : '',
      '    <div class="card-meta">' + (rating ? '<span class="card-rate">&#9733; ' + rating + '</span>' : '') +
        (rc ? '<span>(' + rc + ') đánh giá</span>' : '') +
        (sold ? '<span>' + HS.moneyPlain(sold) + ' đã bán</span>' : '') + '</div>',
      '    <div class="card-foot-off">-' + off + '%</div>',
      '  </div>',
      '</a>',
    ].join('');
  };

  HS.rowCardHTML = function (r) { return HS.cardHTML(HS.rowToProduct(r)); };

})(window);
