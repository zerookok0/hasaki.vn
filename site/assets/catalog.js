/* 分类页 / 搜索页 / 品牌页 共用逻辑
 * URL 形态：/catalog?slug=<cat>、/search?q=<kw>、/catalog?sort=best
 */
(function () {
  'use strict';
  var HS = window.HS;
  var PAGE_SIZE = 40;

  var state = {
    slug: HS.param('slug', '') || HS.param('cat', ''),
    q: HS.param('q', ''),
    sort: HS.param('sort', 'best'),
    brand: HS.param('brand', ''),
    min: HS.param('min', ''),
    max: HS.param('max', ''),
    page: Number(HS.param('page', '1')) || 1,
  };

  /* /deals 页：只显示有促销进度的商品（不是全量列表） */
  if (!state.slug && location.pathname.replace(/\/+$/, '') === '/deals') state.slug = 'deals';

  var all = [];        // 当前全集（row 紧凑数组）
  var cats = [];
  var catMeta = null;

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd');
  }

  function parsePriceRows() {
    return all.map(function (r) {
      var p = HS.rowToProduct(r);
      p.sale = p.sale || HS.salePrice(p.market_price);
      return p;
    });
  }

  function filtered() {
    var arr = parsePriceRows();
    if (state.q) {
      var kw = norm(state.q).split(/\s+/).filter(Boolean);
      arr = arr.filter(function (p) {
        var hay = norm(p.name + ' ' + (p.brandName || '') + ' ' + (p.cat || ''));
        return kw.every(function (k) { return hay.indexOf(k) !== -1; });
      });
    }
    if (state.brand) {
      arr = arr.filter(function (p) { return String(p.brandName || '').toLowerCase() === state.brand.toLowerCase(); });
    }
    if (state.min) arr = arr.filter(function (p) { return p.sale >= Number(state.min); });
    if (state.max) arr = arr.filter(function (p) { return p.sale <= Number(state.max); });
    var s = state.sort;
    if (s === 'asc') arr.sort(function (a, b) { return a.sale - b.sale; });
    else if (s === 'desc') arr.sort(function (a, b) { return b.sale - a.sale; });
    else if (s === 'best') arr.sort(function (a, b) { return (b.popular || 0) - (a.popular || 0); });
    else if (s === 'new') arr.sort(function (a, b) { return b.id - a.id; });
    return arr;
  }

  function renderCrumb() {
    var el = HS.q('#crumb');
    if (!el) return;
    el.innerHTML = '<a href="/">Trang chủ</a><span>&rsaquo;</span><a href="/catalog">Danh mục</a>' +
      (catMeta ? '<span>&rsaquo;</span><span>' + HS.esc(catMeta.name) + '</span>' : '') +
      (state.q ? '<span>&rsaquo;</span><span>Tìm: “' + HS.esc(state.q) + '”</span>' : '');
  }

  function renderSide(list) {
    var el = HS.q('#side');
    if (!el) return;
    var brands = {};
    list.forEach(function (p) {
      if (!p.brandName) return;
      brands[p.brandName] = (brands[p.brandName] || 0) + 1;
    });
    var brandArr = Object.keys(brands).sort(function (a, b) { return brands[b] - brands[a]; }).slice(0, 22);

    var tree = cats.filter(function (c) { return c.level === 1; }).map(function (c) {
      var kids = cats.filter(function (k) { return k.parent === c.id && k.level === 2; }).slice(0, 14);
      return '<div class="side-block"><div class="side-title">' + HS.esc(c.name) + '</div><div class="side-cat">' +
        '<a href="/catalog?slug=' + encodeURIComponent(c.slug) + '"' + (state.slug === c.slug ? ' class="on"' : '') + '>' + HS.esc(c.name) + ' (' + (c.count || 0) + ')</a>' +
        kids.map(function (k) {
          return '<a href="/catalog?slug=' + encodeURIComponent(k.slug) + '"' + (state.slug === k.slug ? ' class="on"' : '') + '>' + HS.esc(k.name) + ' (' + (k.count || 0) + ')</a>';
        }).join('') + '</div></div>';
    }).join('');

    el.innerHTML =
      '<div class="side-block"><div class="side-title">Khoảng giá</div>' +
        '<div class="price-range"><input id="f-min" placeholder="Từ" value="' + HS.esc(state.min) + '"><span>–</span><input id="f-max" placeholder="Đến" value="' + HS.esc(state.max) + '"></div>' +
        '<button class="btn-apply" id="f-apply">Áp dụng</button></div>' +
      (brandArr.length ? '<div class="side-block"><div class="side-title">Thương hiệu</div>' + brandArr.map(function (b) {
        return '<label class="check"><input type="checkbox" data-brand="' + HS.esc(b) + '"' + (state.brand === b ? ' checked' : '') + '>' +
          HS.esc(b) + ' <span class="n">(' + brands[b] + ')</span></label>';
      }).join('') + '</div>' : '') +
      tree;

    HS.qa('[data-brand]', el).forEach(function (cb) {
      cb.addEventListener('change', function () {
        state.brand = cb.checked ? cb.dataset.brand : '';
        state.page = 1;
        render();
      });
    });
    var apply = HS.q('#f-apply', el);
    if (apply) apply.addEventListener('click', function () {
      state.min = (HS.q('#f-min').value || '').replace(/\./g, '');
      state.max = (HS.q('#f-max').value || '').replace(/\./g, '');
      state.page = 1;
      render();
    });
  }

  function renderHead(total) {
    var el = HS.q('#cat-head');
    if (!el) return;
    var title = state.q ? ('Kết quả cho “' + HS.esc(state.q) + '”') : (catMeta ? HS.esc(catMeta.name) : 'Tất cả sản phẩm');
    var sorts = [['new', 'Mới nhất'], ['best', 'Bán chạy'], ['asc', 'Giá thấp đến cao'], ['desc', 'Giá cao đến thấp']];
    el.innerHTML = '<div class="cat-title">' + title + ' <span>(' + total + ')</span></div>' +
      '<div class="sort-tabs">' + sorts.map(function (s) {
        return '<button data-sort="' + s[0] + '"' + (state.sort === s[0] ? ' class="on"' : '') + '>' + s[1] + '</button>';
      }).join('') + '</div>' +
      '<button class="btn btn-outline btn-sm" data-toggle-side>Danh mục</button>';
    HS.qa('[data-sort]', el).forEach(function (b) {
      b.addEventListener('click', function () { state.sort = b.dataset.sort; state.page = 1; render(); });
    });
    HS.bindMobileMenu();
  }

  function renderGrid(list) {
    var grid = HS.q('#cat-grid');
    var start = (state.page - 1) * PAGE_SIZE;
    var slice = list.slice(start, start + PAGE_SIZE);
    grid.innerHTML = slice.length ? slice.map(function (p) { return HS.cardHTML(p); }).join('')
      : '<div class="empty" style="grid-column:1/-1">Không tìm thấy sản phẩm phù hợp. Thử từ khóa khác.</div>';
  }

  function renderPager(total) {
    var el = HS.q('#cat-pager');
    var pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    if (pages <= 1) { el.innerHTML = ''; return; }
    var cur = Math.min(state.page, pages);
    var nums = [];
    var from = Math.max(1, cur - 2), to = Math.min(pages, from + 4);
    if (to - from < 4) from = Math.max(1, to - 4);
    for (var i = from; i <= to; i++) nums.push(i);
    el.innerHTML = '<button data-p="' + Math.max(1, cur - 1) + '"' + (cur === 1 ? ' disabled' : '') + '>&lsaquo;</button>' +
      nums.map(function (n) { return '<button data-p="' + n + '"' + (n === cur ? ' class="on"' : '') + '>' + n + '</button>'; }).join('') +
      '<button data-p="' + Math.min(pages, cur + 1) + '"' + (cur === pages ? ' disabled' : '') + '>&rsaquo;</button>' +
      '<span style="margin-left:10px;font-size:12px;color:#777">' + total + ' sản phẩm</span>';
    HS.qa('[data-p]', el).forEach(function (b) {
      b.addEventListener('click', function () {
        state.page = Number(b.dataset.p);
        render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    });
  }

  function render() {
    renderCrumb();
    var list = filtered();
    renderSide(list);
    renderHead(list.length);
    renderGrid(list);
    renderPager(list.length);
    document.title = (state.q ? state.q + ' - tìm kiếm' : catMeta ? catMeta.name : 'Danh mục') + ' | Hasaki.vn';
  }

  async function boot() {
    HS.mountChrome(state.slug ? 'DANH MỤC' : (state.q ? '' : 'DANH MỤC'));
    document.addEventListener('hs:cats', function (e) { cats = e.detail || []; renderSide(parsePriceRows()); });
    try { cats = (await fetch('/data/categories.json').then(function (r) { return r.json(); })) || []; } catch (e) { cats = []; }

    if (state.slug) {
      catMeta = cats.filter(function (c) { return c.slug === state.slug; })[0] || { name: state.slug, slug: state.slug };
      try {
        var j = await fetch('/data/cat/' + encodeURIComponent(state.slug) + '.json').then(function (r) { return r.ok ? r.json() : null; });
        all = (j && j.rows) || [];
        if (j && j.name) catMeta.name = j.name;
      } catch (e) { all = []; }
      /* 类目分片缺失时不再回退到全量列表（否则每个类目都长一样） */
    } else {
      var idx2 = await HS.loadIndex();
      all = idx2.rows || [];
    }
    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
