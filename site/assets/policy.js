/* 政策 / 条款页：/policy?slug=terms|privacy|return|... 数据来自 /data/policy.json */
(function () {
  'use strict';
  var HS = window.HS;
  var NAV = [
    ['terms', 'Điều khoản sử dụng'],
    ['privacy', 'Chính sách bảo mật'],
    ['cookie', 'Chính sách cookie'],
    ['return', 'Đổi trả - Hoàn tiền'],
    ['guarantee', 'Chính sách bảo hành'],
    ['payment', 'Phương thức thanh toán'],
    ['shipping', 'Quy trình giao hàng'],
    ['order-guide', 'Hướng dẫn đặt hàng'],
    ['about', 'Giới thiệu Hasaki'],
    ['branch', 'Hệ thống cửa hàng'],
    ['clinic', 'Hasaki Clinic & Spa'],
    ['dermahair', 'DermaHair'],
    ['support', 'Hỗ trợ khách hàng'],
    ['faq', 'Câu hỏi thường gặp'],
    ['contact', 'Liên hệ'],
    ['career', 'Tuyển dụng'],
    ['handbook', 'Hasaki cẩm nang'],
  ];

  function renderNav(slug) {
    var el = HS.q('#pol-nav');
    el.innerHTML = '<div class="side-block"><div class="side-title">Chính sách & hỗ trợ</div><div class="side-cat">' +
      NAV.map(function (n) {
        return '<a href="/policy?slug=' + n[0] + '"' + (n[0] === slug ? ' class="on"' : '') + '>' + n[1] + '</a>';
      }).join('') + '</div></div>';
  }

  function boot() {
    HS.mountChrome('');
    var slug = HS.param('slug', 'terms');
    renderNav(slug);
    fetch('/data/policy.json').then(function (r) { return r.json(); }).then(function (map) {
      var page = map[slug] || map.terms;
      if (!page) { HS.q('#pol-body').innerHTML = '<p>Không tìm thấy nội dung.</p>'; return; }
      HS.q('#pol-title').textContent = page.title || slug;
      HS.q('#pol-crumb').textContent = page.title || slug;
      /* 正文来自原站，做一次标签白名单清洗 */
      var html = String(page.html || '')
        .replace(/<(script|style|iframe|object|embed|form|input|button)\b[\s\S]*?<\/\1>/gi, '')
        .replace(/\son\w+="[^"]*"/gi, '')
        .replace(/javascript:/gi, '');
      HS.q('#pol-body').innerHTML = html;
      document.title = (page.title || slug) + ' | Hasaki.vn';
      /* 正文里的图片补样式 */
      HS.qa('#pol-body img').forEach(function (im) { im.style.maxWidth = '100%'; im.style.height = 'auto'; });
    }).catch(function () {
      HS.q('#pol-body').innerHTML = '<p>Không tải được nội dung, vui lòng thử lại.</p>';
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
