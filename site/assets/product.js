/* 商品详情页：/product?id=<id>，数据来自 /data/p/<bucket>.json */
(function () {
  'use strict';
  var HS = window.HS;
  var id = Number(HS.param('id', '0')) || 0;
  var P = null;
  var qty = 1;
  var activeImg = 0;
  var currentTab = 'desc';

  function activateTab(name) {
    HS.qa('.pd-tabs .tabbar button').forEach(function (x) { x.classList.toggle('on', x.dataset.tab === name); });
    HS.qa('.pd-tabs .tabbody').forEach(function (x) { x.classList.toggle('hidden', x.dataset.body !== name); });
  }

  function money(n) { return HS.money(n); }

  function crumbHTML(p) {
    var parts = ['<a href="/">Trang chủ</a>'];
    (p.cats || []).slice(0, 3).forEach(function (c) {
      parts.push('<span>&rsaquo;</span><a href="/catalog?cat=' + encodeURIComponent(c.slug || c.name) + '">' + HS.esc(c.name) + '</a>');
    });
    parts.push('<span>&rsaquo;</span><span>' + HS.esc(p.name) + '</span>');
    return parts.join('');
  }

  function galleryHTML(p) {
    var g = p.gallery && p.gallery.length ? p.gallery : ['/assets/placeholder.svg'];
    return '<div class="pd-main">' +
      '<div class="pd-thumbs" id="pd-thumbs">' + g.map(function (u, i) {
        return '<button data-i="' + i + '"' + (i === 0 ? ' class="on"' : '') + '><img loading="lazy" src="' + HS.esc(u) + '" alt=""></button>';
      }).join('') + '</div>' +
      '<div class="pd-gallery"><div class="main"><img id="pd-main-img" src="' + HS.esc(g[0]) + '" alt="' + HS.esc(p.name) + '"></div>' +
      '<div class="pd-gallery-badge" style="margin-top:8px;font-size:12px;color:#777">Hình ảnh thực tế từ khách hàng</div>' +
      '<div class="ot" id="pd-ot">' + g.slice(0, 6).map(function (u, i) {
        return '<button data-i="' + i + '"><img loading="lazy" src="' + HS.esc(u) + '" alt=""></button>';
      }).join('') + '</div></div>' +
      infoHTML(p) + '</div>';
  }

  function infoHTML(p) {
    var sale = p.sale || HS.salePrice(p.market_price);
    var market = p.market_price || 0;
    var off = HS.offPercent(market, sale);
    var save = Math.max(0, market - sale);
    var rate = (p.rating && p.rating.avg) || 0;
    var rtotal = (p.rating && p.rating.total) || 0;
    var deal = p.deal || null;
    var variants = p.variants || [];

    return '<div class="pd-info">' +
      '<h1 class="pd-title">' + HS.esc(p.name) + '</h1>' +
      '<div class="pd-en">' + HS.esc(p.en) + '</div>' +
      (p.announce ? '<div class="pd-announce">' + HS.esc(p.announce) + '</div>' : '') +
      '<div class="pd-rate">' +
        (rate ? '<span class="sc">&#9733; ' + rate + '</span>' : '') +
        '<span>' + rtotal + ' đánh giá</span>' +
        '<span>' + (p.comment_total || 0) + ' Hỏi đáp</span>' +
        '<span>Mã sản phẩm: ' + HS.esc(p.sku || p.id) + '</span>' +
      '</div>' +
      (deal ? '<div class="pd-flash"><span>&#9889; FLASH DEAL</span><span class="clock" data-pd-clock>KẾT THÚC TRONG <b>00</b>:<b>00</b>:<b>00</b></span></div>' : '') +
      ((p.promos && p.promos.length) ? '<div class="pd-promo">' + p.promos.slice(0, 2).map(function (t) { return '<div>&#10022; ' + HS.esc(t) + '</div>'; }).join('') + '</div>'
        : (p.promo ? '<div class="pd-promo">&#10022; ' + HS.esc(p.promo) + '</div>' : '')) +
      '<div class="pd-price"><span class="now">' + money(sale) + '</span>' +
        (market > sale ? '<span class="base">Giá thường ' + money(market) + '</span>' : '') + '</div>' +
      '<div class="pd-save">Tiết kiệm <span class="s">' + money(save) + ' (' + off + '%)</span> · Đã bao gồm VAT</div>' +
      (variants.length ? '<div class="pd-variant-group"><div class="lbl">Phân loại</div><div class="pd-variants">' +
        variants.map(function (v) {
          return v.id === p.id ? '<a class="on" href="/product?id=' + v.id + '">' + HS.esc(v.label) + '</a>'
            : '<a href="/product?id=' + v.id + '">' + HS.esc(v.label) + '</a>';
        }).join('') + '</div></div>' : '') +
      '<div class="center gap-12" style="margin-top:4px"><span style="font-size:12.5px;color:#555">Số lượng:</span>' +
        '<span class="qty"><button type="button" data-q="-1">&minus;</button><input id="pd-qty" value="1" inputmode="numeric"><button type="button" data-q="1">+</button></span>' +
        '<span style="font-size:12px;color:#25bc4e">' + (p.quantity > 0 ? 'Còn hàng' : 'Liên hệ') + '</span></div>' +
      (p.now_free ? '<div class="pd-trust" style="background:#fff3e8;color:#c85a00"><b>NowFree</b> Giao Nhanh Miễn Phí 2H — Đặt hàng trước 8h và chọn giao hàng 2H ở bước thanh toán.</div>' : '') +
      '<div class="pd-actions" style="margin-top:6px">' +
        '<button class="btn btn-outline" id="pd-store">350/352 Cửa hàng</button>' +
        '<button class="btn btn-orange" id="pd-add">&#128722; GIỎ HÀNG</button>' +
        '<button class="btn btn-green btn-block" id="pd-buy" style="grid-column:1/-1">MUA NGAY NOWFREE 2H</button>' +
      '</div>' +
      '</div>';
  }

  function tabsHTML(p) {
    var desc = p.desc || '';
    var spec = p.spec || [];
    var reviews = p.reviews || { total: 0, items: [] };
    var bars = p.ratingBars || null;
    return '<div class="pd-tabs">' +
      '<div class="tabbar">' +
        '<button class="on" data-tab="desc">Mô tả</button>' +
        '<button data-tab="spec">Thông số</button>' +
        '<button data-tab="ingr">Thành phần</button>' +
        '<button data-tab="guide">HDSD</button>' +
        '<button data-tab="review">Đánh giá (' + (reviews.total || 0) + ')</button>' +
        '<button data-tab="qa">Hỏi đáp</button>' +
      '</div>' +
      '<div class="tabbody" data-body="desc">' + (desc || '<p>Thông tin sản phẩm đang được cập nhật.</p>') + '</div>' +
      '<div class="tabbody hidden" data-body="spec">' + specHTML(spec) + '</div>' +
      '<div class="tabbody hidden" data-body="ingr">' + (p.ingr ? '<div class="rich">' + p.ingr + '</div>' : '<p>Đang cập nhật.</p>') + '</div>' +
      '<div class="tabbody hidden" data-body="guide">' + (p.guide ? '<div class="rich">' + p.guide + '</div>' : '<p>Đang cập nhật.</p>') + '</div>' +
      '<div class="tabbody hidden" data-body="review">' + reviewHTML(p, bars) + '</div>' +
      '<div class="tabbody hidden" data-body="qa">' + qaHTML(reviews) + '</div>' +
      '</div>';
  }

  function specHTML(spec) {
    if (!spec.length) return '<p>Đang cập nhật.</p>';
    return '<table class="spec-table"><tbody>' + spec.map(function (r) {
      return '<tr><td>' + HS.esc(r[0]) + '</td><td>' + HS.esc(r[1]) + '</td></tr>';
    }).join('') + '</tbody></table>';
  }

  function reviewHTML(p, bars) {
    var r = p.reviews || { total: 0, items: [] };
    var avg = (p.rating && p.rating.avg) || 0;
    var total = r.total || (r.items || []).length || 0;
    var hasBars = Array.isArray(bars) && bars.some(function (b) { return b.count > 0; });
    var rows = hasBars ? bars : [];
    var max = rows.reduce(function (m, x) { return Math.max(m, x.count); }, 1);
    var sourceNote = '';
    if (r.source === 'series') {
      sourceNote = '<div class="rv-source">Nhận xét từ khách hàng đã mua sản phẩm cùng dòng' + (r.from ? ' — <b>' + HS.esc(r.from) + '</b>' : '') + '</div>';
    } else if (r.source === 'brand') {
      sourceNote = '<div class="rv-source">Nhận xét từ khách hàng đã mua sản phẩm cùng thương hiệu' + (r.from ? ' — <b>' + HS.esc(r.from) + '</b>' : '') + '</div>';
    }
    return sourceNote + '<div class="review-sum"><div class="avg"><b>' + (avg || '—') + '</b><div class="stars">' +
      (avg ? '&#9733;'.repeat(Math.round(avg)) : '') + '</div><div style="font-size:12px;color:#777">' + total + ' đánh giá</div></div>' +
      (hasBars ? '<div>' + rows.map(function (x) {
        return '<div class="bar-row"><span>' + x.star + ' sao</span><span class="bar"><i style="width:' + Math.round(x.count / max * 100) + '%"></i></span><span>' + x.count + '</span></div>';
      }).join('') + '</div>'
        : (total > 0 ? '' : '<div style="font-size:12.5px;color:#777;line-height:1.7">Sản phẩm này chưa có đánh giá bằng sao. Hãy là người đầu tiên chia sẻ cảm nhận sau khi mua hàng tại Hasaki.</div>')) +
      '</div>' +
      '<div style="margin-top:12px">' + (r.items || []).map(function (c) {
        var st = Number(c.star) || 0;
        return '<div class="review-item"><div class="who"><b>' + HS.esc(c.user || 'Khách hàng') + '</b>' +
          (st ? '<span class="stars">' + '&#9733;'.repeat(st) + '</span>' : '') +
          '<span>' + (c.at ? new Date(c.at * 1000).toLocaleDateString('vi-VN') : '') + '</span>' +
          (c.like ? '<span>' + c.like + ' thích</span>' : '') + '</div>' +
          '<div class="txt">' + HS.esc(c.content) + '</div>' +
          ((c.imgs || []).length ? '<div class="rv-imgs">' + c.imgs.map(function (u) {
            return '<img src="' + HS.esc(u) + '" alt="">';
          }).join('') + '</div>' : '') +
          ((c.replies || []).map(function (x) {
            return '<div class="review-reply"><b>' + HS.esc(x.user || 'Hasaki') + ':</b> ' + HS.esc(x.content) + '</div>';
          }).join('')) + '</div>';
      }).join('') || '<p style="color:#999">Chưa có đánh giá nào.</p>' + '</div>';
  }

  function qaHTML(r) {
    var items = (r.items || []).filter(function (c) { return c.content; }).slice(0, 3);
    if (!items.length) return '<p style="color:#999">Chưa có câu hỏi nào.</p>';
    return items.map(function (c) {
      return '<div class="review-item"><div class="who"><b>' + HS.esc(c.user || 'Khách') + '</b></div><div class="txt">' + HS.esc(c.content) + '</div></div>';
    }).join('');
  }

  function asideHTML(p) {
    var related = p.related || [];
    var sameBrand = p.sameBrand || [];
    return '<div class="pd-aside">' +
      '<div class="aside-card">' +
        '<div class="trust-row"><div style="width:34px;height:34px;border-radius:50%;background:#eaf3ee;color:#306e51;display:grid;place-items:center;font-weight:800;font-size:12px">2H</div><div><b>Giao Nhanh Miễn Phí 2H</b><span>Trễ tặng 100K</span></div></div>' +
        '<div class="trust-row"><div><b>Hasaki đền bù 100% hàng giả</b><span>đền bù 100% nếu phát hiện hàng giả</span></div></div>' +
        '<div class="trust-row"><div><b>Giao Hàng Miễn Phí</b><span>từ 249K (tối đa 60km)</span></div></div>' +
        '<div class="trust-row"><div><b>Đổi trả trong 30 ngày</b></div></div>' +
      '</div>' +
      (p.brand && p.brand.image ? '<div class="aside-card brand-card"><img src="' + HS.esc(p.brand.image) + '" alt=""><b>' + HS.esc(p.brand.name) + '</b>' +
        '<a class="btn btn-outline btn-sm" href="/search?q=' + encodeURIComponent(p.brand.name) + '">Theo dõi +</a></div>' : '') +
      (related.length ? '<div class="aside-card"><div class="side-title">Sản phẩm xem cùng</div>' + related.map(miniRow).join('') + '</div>' : '') +
      (sameBrand.length ? '<div class="aside-card"><div class="side-title">Sản phẩm cùng thương hiệu</div>' + sameBrand.map(miniRow).join('') + '</div>' : '') +
      '</div>';
  }

  function miniRow(p) {
    var sale = p.sale || HS.salePrice(p.market_price);
    var off = HS.offPercent(p.market_price, sale);
    return '<a class="mini-card" href="/product?id=' + p.id + '">' +
      '<img loading="lazy" src="' + HS.esc(p.img || (p.gallery && p.gallery[0]) || '') + '" alt="">' +
      '<div><div class="p">' + HS.money(sale) + ' <span class="off-badge">-' + off + '%</span></div>' +
      '<div class="o">' + HS.money(p.market_price) + '</div>' +
      '<div class="nm">' + HS.esc(p.name) + '</div></div>' +
      '<span style="font-size:11px;color:#999">Xem</span></a>';
  }

  function bind(p) {
    var thumbs = HS.q('#pd-thumbs');
    var mainImg = HS.q('#pd-main-img');
    var ot = HS.q('#pd-ot');
    function setImg(i) {
      var g = p.gallery && p.gallery.length ? p.gallery : ['/assets/placeholder.svg'];
      activeImg = i;
      if (mainImg) mainImg.src = g[i];
      HS.qa('#pd-thumbs button').forEach(function (b) { b.classList.toggle('on', Number(b.dataset.i) === i); });
    }
    if (thumbs) thumbs.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) setImg(Number(b.dataset.i));
    });
    if (ot) ot.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (b) setImg(Number(b.dataset.i));
    });

    var qtyInput = HS.q('#pd-qty');
    HS.qa('[data-q]').forEach(function (b) {
      b.addEventListener('click', function () {
        qty = Math.max(1, Math.min(99, (Number(qtyInput.value) || 1) + Number(b.dataset.q)));
        qtyInput.value = qty;
      });
    });
    if (qtyInput) qtyInput.addEventListener('change', function () {
      qty = Math.max(1, Math.min(99, Number(qtyInput.value) || 1)); qtyInput.value = qty;
    });

    var addBtn = HS.q('#pd-add');
    if (addBtn) addBtn.addEventListener('click', function () {
      HS.cart.add(productForCart(p), qty);
      HS.toast('Đã thêm vào giỏ hàng');
    });
    var buyBtn = HS.q('#pd-buy');
    if (buyBtn) buyBtn.addEventListener('click', function () {
      HS.cart.add(productForCart(p), qty);
      location.href = '/checkout';
    });
    var storeBtn = HS.q('#pd-store');
    if (storeBtn) storeBtn.addEventListener('click', function () { location.href = '/policy?slug=branch'; });

    var tabbar = HS.q('.pd-tabs .tabbar');
    if (tabbar) tabbar.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      currentTab = b.dataset.tab;
      activateTab(currentTab);
    });

    /* FLASH DEAL 倒计时 */
    var clock = HS.q('[data-pd-clock]');
    if (clock && p.deal && p.deal.expired) {
      var end = p.deal.remain ? Date.now() + p.deal.remain * 1000 : p.deal.expired * 1000;
      (function tick() {
        var left = Math.max(0, end - Date.now());
        var d = Math.floor(left / 864e5), h = Math.floor(left % 864e5 / 3600e3),
          m = Math.floor(left % 3600e3 / 60e3), s = Math.floor(left % 60e3 / 1000);
        clock.innerHTML = 'KẾT THÚC TRONG ' + [d ? d + ' NGÀY ' : '', '<b>' + String(h).padStart(2, '0') + '</b>:<b>' + String(m).padStart(2, '0') + '</b>:<b>' + String(s).padStart(2, '0') + '</b>'].join('');
        setTimeout(tick, 1000);
      })();
    }
  }

  function productForCart(p) {
    return {
      id: p.id, name: p.name, brandName: p.brand && p.brand.name, img: (p.gallery && p.gallery[0]) || p.img,
      sale: p.sale, market_price: p.market_price, slug: p.slug, cat: p.cat_name,
    };
  }

  function render() {
    var root = HS.q('#pd-root');
    if (!P) {
      root.innerHTML = '<div class="empty">Không tìm thấy sản phẩm (id=' + id + '). <a href="/catalog" style="color:#306e51">Tiếp tục mua sắm</a></div>';
      return;
    }
    if (P.dead) {
      root.innerHTML = '<div class="empty">Sản phẩm không còn kinh doanh. <a href="/catalog" style="color:#306e51">Xem sản phẩm khác</a></div>';
      return;
    }
    var crumb = HS.q('#crumb'); if (crumb) crumb.innerHTML = crumbHTML(P);
    root.innerHTML = '<div class="pd-top">' + galleryHTML(P) + asideHTML(P) + '</div>' + tabsHTML(P);
    bind(P);
    activateTab(currentTab);
    document.title = P.name + ' | Hasaki.vn';
    HS.pixel.viewContent({ id: P.id, name: P.name, cat: P.cat_name, sale: P.sale, market_price: P.market_price });
  }

  async function boot() {
    HS.mountChrome('');
    P = await HS.loadProduct(id);
    if (P && !P.dead) {
      /* 补齐图片、推荐（同品牌/同分类） */
      if (!P.img) P.img = (P.gallery && P.gallery[0]) || '';
      try {
        var idx = await HS.loadIndex();
        var rows = (idx.rows || []);
        var sameBrand = [], related = [];
        for (var i = 0; i < rows.length && (sameBrand.length < 5 || related.length < 5); i++) {
          var r = rows[i];
          if (r[0] === P.id) continue;
          if (sameBrand.length < 5 && P.brand && r[2] === P.brand.name) sameBrand.push(HS.rowToProduct(r));
          if (related.length < 5 && P.cat_name && r[6] === P.cat_name) related.push(HS.rowToProduct(r));
        }
        P.sameBrand = sameBrand;
        P.related = related;
      } catch (e) {}
    }
    render();
    /* 评论 + 评分分布（懒加载） */
    if (P && !P.dead) {
      fetch('/data/rv/' + Math.floor(id / 500) + '.json').then(function (r) { return r.ok ? r.json() : {}; })
        .then(function (map) {
          var rv = map[String(id)];
          if (rv) { P.reviews = rv; P.ratingBars = rv.bars; render(); }
        }).catch(function () {});
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
