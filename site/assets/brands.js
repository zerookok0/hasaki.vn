/* 品牌墙：数据来自 /data/brands.json（构建期生成） */
(function () {
  'use strict';
  var HS = window.HS;

  function boot() {
    HS.mountChrome('THƯƠNG HIỆU');
    fetch('/data/brands.json').then(function (r) { return r.ok ? r.json() : []; }).then(function (list) {
      var grid = HS.q('#brand-grid');
      HS.q('#brand-count').textContent = list.length + ' thương hiệu';
      grid.innerHTML = list.map(function (b) {
        return '<a class="brand-tile" href="/search?q=' + encodeURIComponent(b.name) + '" title="' + HS.esc(b.name) + '">' +
          (b.img ? '<img loading="lazy" src="' + HS.esc(b.img) + '" alt="' + HS.esc(b.name) + '">'
            : '<b style="font-size:14px;color:#306e51">' + HS.esc(b.name) + '</b>') + '</a>';
      }).join('');
    }).catch(function () {
      HS.q('#brand-grid').innerHTML = '<div class="empty">Không tải được danh sách thương hiệu.</div>';
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
