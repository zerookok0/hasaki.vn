/* 登录 / 注册 / 账号 / 页头登录态 */
(function () {
  'use strict';
  var HS = window.HS;

  function api(path, body) {
    return fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      credentials: 'same-origin',
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) { return r.json().catch(function () { return {}; }); });
  }

  function paintHeader(user) {
    var nameEl = HS.q('[data-auth-name]');
    var subEl = HS.q('[data-auth-sub]');
    if (!nameEl) return;
    if (user) {
      nameEl.textContent = 'Chào, ' + (user.name || 'bạn');
      if (subEl) subEl.textContent = 'Tài khoản';
      var link = HS.q('[data-auth-slot]');
      if (link) link.setAttribute('href', '/account');
    } else {
      nameEl.textContent = 'Đăng nhập / Đăng ký';
      if (subEl) subEl.textContent = 'Tài khoản';
    }
  }

  HS.auth = {
    me: function () { return api('/api/customer/me'); },
    login: function (email, password) { return api('/api/customer/login', { email: email, password: password }); },
    register: function (data) { return api('/api/customer/register', data); },
    logout: function () { return api('/api/customer/logout', {}); },
  };

  function bootLogin() {
    var f = HS.q('#auth-form');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = HS.q('#auth-error'); err.textContent = '';
      var email = HS.q('#lg-email').value.trim();
      var pass = HS.q('#lg-pass').value;
      if (!email || !pass) { err.textContent = 'Vui lòng nhập đầy đủ thông tin.'; return; }
      var btn = HS.q('button[type=submit]', f);
      btn.setAttribute('aria-busy', 'true'); btn.style.opacity = '.7';
      HS.auth.login(email, pass).then(function (r) {
        btn.removeAttribute('aria-busy'); btn.style.opacity = '';
        if (r && r.ok) {
          localStorage.setItem('hs_profile', JSON.stringify(r.user || { email: email }));
          HS.toast('Đăng nhập thành công');
          var next = HS.param('next', '/account');
          setTimeout(function () { location.href = next; }, 350);
        } else {
          err.textContent = (r && r.message) || 'Đăng nhập thất bại, vui lòng thử lại.';
        }
      }).catch(function () { btn.removeAttribute('aria-busy'); err.textContent = 'Không kết nối được, vui lòng thử lại.'; });
    });
  }

  function bootRegister() {
    var f = HS.q('#reg-form');
    if (!f) return;
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var err = HS.q('#auth-error'); err.textContent = '';
      var data = {
        name: HS.q('#rg-name').value.trim(),
        phone: HS.q('#rg-phone').value.trim(),
        email: HS.q('#rg-email').value.trim(),
        password: HS.q('#rg-pass').value,
        password2: HS.q('#rg-pass2').value,
        city: HS.q('#rg-city').value,
        zip: HS.q('#rg-zip').value.trim(),
        addr: HS.q('#rg-addr').value.trim(),
        terms: HS.q('#rg-terms').checked,
      };
      if (!data.name || !data.email || !data.password) { err.textContent = 'Vui lòng nhập họ tên, email và mật khẩu.'; return; }
      if (data.password.length < 6) { err.textContent = 'Mật khẩu tối thiểu 6 ký tự.'; return; }
      if (data.password !== data.password2) { err.textContent = 'Mật khẩu nhập lại không khớp.'; return; }
      if (!data.terms) { err.textContent = 'Bạn cần đồng ý với điều khoản sử dụng.'; return; }
      var btn = HS.q('button[type=submit]', f);
      btn.setAttribute('aria-busy', 'true'); btn.style.opacity = '.7';
      HS.auth.register(data).then(function (r) {
        btn.removeAttribute('aria-busy'); btn.style.opacity = '';
        if (r && r.ok) {
          localStorage.setItem('hs_profile', JSON.stringify(r.user || data));
          HS.toast('Đăng ký thành công');
          setTimeout(function () { location.href = '/account'; }, 400);
        } else {
          err.textContent = (r && r.message) || 'Đăng ký thất bại, vui lòng thử lại.';
        }
      }).catch(function () { btn.removeAttribute('aria-busy'); err.textContent = 'Không kết nối được, vui lòng thử lại.'; });
    });
  }

  function bootAccount() {
    if (!HS.q('#acc-profile')) return;
    HS.auth.me().then(function (r) {
      var user = r && r.user;
      if (!user) {
        /* cookie 会话丢了也允许用本地缓存兜底（同一浏览器内体验优先） */
        try {
          var p0 = JSON.parse(localStorage.getItem('hs_profile') || 'null');
          if (p0 && (p0.email || p0.name)) {
            user = {
              id: 'HS' + String(p0.email || p0.name).length,
              name: p0.name || String(p0.email || '').split('@')[0],
              email: p0.email || '', phone: p0.phone || '',
              membership: p0.membership || 'Thành viên mới',
              joined_at: p0.joined_at || new Date().toLocaleDateString('vi-VN'),
              points: p0.points || 0,
            };
          }
        } catch (e) {}
      }
      if (!user) {
        location.replace('/login?next=/account');
        return;
      }
      paintHeader(user);
      var prof = HS.q('#acc-profile');
      prof.innerHTML = [
        ['Họ tên', user.name], ['Email', user.email], ['Số điện thoại', user.phone || '—'],
        ['Hạng thành viên', user.membership || 'Thành viên mới'],
        ['Ngày tham gia', user.joined_at || new Date().toLocaleDateString('vi-VN')],
        ['Điểm tích lũy', user.points || 0],
      ].map(function (r2) {
        return '<div class="between" style="padding:8px 0;border-bottom:1px solid #efeff3;font-size:13px"><span style="color:#777">' + r2[0] + '</span><b>' + HS.esc(r2[1] || '—') + '</b></div>';
      }).join('');

      var p = {};
      try { p = JSON.parse(localStorage.getItem('hs_profile') || '{}'); } catch (e) {}
      HS.q('#acc-addr').innerHTML = (p.addr || p.city) ?
        '<div style="font-size:13px;line-height:1.7"><b>' + HS.esc(user.name) + '</b><br>' + HS.esc(p.addr || '') +
        '<br>' + HS.esc(p.city || '') + ' ' + HS.esc(p.zip || '') + '<br>' + HS.esc(user.phone || '') + '</div>'
        : '<div style="font-size:13px;color:#999">Chưa có địa chỉ. Địa chỉ sẽ được điền khi bạn thanh toán.</div>';

      var orders = [];
      try { orders = JSON.parse(localStorage.getItem('hs_orders') || '[]'); } catch (e) {}
      HS.q('#acc-orders').innerHTML = orders.length ? orders.slice(-6).reverse().map(function (o) {
        return '<div class="between" style="padding:8px 0;border-bottom:1px solid #efeff3;font-size:13px">' +
          '<span><b>' + HS.esc(o.no) + '</b><br><span style="color:#777">' + (o.at || '') + '</span></span>' +
          '<b style="color:#d0021b">' + HS.money(o.total) + '</b></div>';
      }).join('') : '<div style="font-size:13px;color:#999">Chưa có đơn hàng nào.</div>';

      var out = HS.q('#acc-logout');
      if (out) out.addEventListener('click', function () {
        HS.auth.logout().then(function () { localStorage.removeItem('hs_profile'); location.href = '/'; });
      });
    }).catch(function () { location.replace('/login?next=/account'); });
  }

  function bootChrome() {
    if (HS.q('#acc-profile')) return; /* 账号页自己处理 */
    HS.auth.me().then(function (r) { paintHeader(r && r.user); }).catch(function () {});
  }

  function boot() {
    HS.mountChrome('');
    bootLogin(); bootRegister(); bootAccount(); bootChrome();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
