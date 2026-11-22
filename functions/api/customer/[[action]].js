/**
 * 会员接口（无外部存储：账号表落在 HttpOnly cookie `hs_accounts`，会话落在 `hs_user`）
 *
 * 口径（lenient，仿站演示）：
 *  - 老用户：只要邮箱（或手机号）在账号表里，**不校验密码**，直接登录成功并带出资料
 *  - 新用户：任意非空账号 + 密码即可登录，自动建一份会员档案（member）
 *  - 注册：真正校验字段（姓名/邮箱/密码长度/二次确认/条款），写入账号表并自动登录
 *  - 退出：只清会话，保留账号表（下次登录仍带出资料）
 */
const MAX_AGE = 60 * 60 * 24 * 30; // 30 天
const MAX_ACCOUNTS = 8;

/* ---------------- cookie 工具 ---------------- */
function readCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  if (!m) return '';
  try { return decodeURIComponent(m[1]); } catch (e) { return ''; }
}

function setCookie(name, value, maxAge = MAX_AGE) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax`;
}

function jsonHeaders(cookies = []) {
  const h = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  for (const c of cookies) h.append('Set-Cookie', c);
  return h;
}

/* ---------------- 账号表 ---------------- */
function readAccounts(request) {
  try {
    const v = JSON.parse(readCookie(request, 'hs_accounts') || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

function writeAccounts(accounts) {
  return setCookie('hs_accounts', JSON.stringify(accounts.slice(-MAX_ACCOUNTS)));
}

function hashId(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return 'HS' + h.toString(36).toUpperCase().padStart(6, '0');
}

function nameFromEmail(email) {
  const base = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base.split(/\s+/).filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Khách hàng';
}

function tierOf(points) {
  const p = Number(points) || 0;
  if (p >= 5000000) return 'Kim Cương';
  if (p >= 2000000) return 'Bạch Kim';
  if (p >= 500000) return 'Vàng';
  return 'Thành viên mới';
}

function publicUser(acc) {
  const points = Number(acc.points) || 0;
  return {
    id: acc.id,
    name: acc.name,
    email: acc.email,
    phone: acc.phone || '',
    membership: acc.membership || tierOf(points),
    tier: tierOf(points),
    points,
    joined_at: acc.joined_at || new Date().toLocaleDateString('vi-VN'),
    last_login: new Date().toLocaleString('vi-VN'),
    addr: acc.addr || '',
    city: acc.city || '',
    zip: acc.zip || '',
    orders: acc.orders || 0,
    is_returning: !!acc.password_set,
  };
}

function upsertAccount(accounts, email, patch) {
  const key = String(email || '').toLowerCase();
  const idx = accounts.findIndex((a) => String(a.email || '').toLowerCase() === key);
  if (idx >= 0) {
    accounts[idx] = { ...accounts[idx], ...patch };
    return accounts[idx];
  }
  const acc = { id: hashId(key), email, name: nameFromEmail(email), points: 0, orders: 0, joined_at: new Date().toLocaleDateString('vi-VN'), ...patch };
  accounts.push(acc);
  return acc;
}

/* ---------------- 路由 ---------------- */
export async function onRequestPost({ request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  /* -------- 登录：老用户不校验密码 -------- */
  if (path.endsWith('/login')) {
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!email || !password) {
      return Response.json({ ok: false, code: 'missing_fields', message: 'Vui lòng nhập email và mật khẩu.' }, { status: 200 });
    }

    const accounts = readAccounts(request);
    const key = email.toLowerCase();
    let idx = accounts.findIndex((a) => String(a.email || '').toLowerCase() === key);
    const isReturning = idx >= 0;

    if (!isReturning) {
      /* 新邮箱：lenient 直接建号（老用户「免验证」的对偶：新用户也不拦） */
      accounts.push({
        id: hashId(key),
        email,
        name: nameFromEmail(email),
        phone: '',
        points: 0,
        orders: 0,
        joined_at: new Date().toLocaleDateString('vi-VN'),
        password_set: true,
      });
      idx = accounts.length - 1;
    } else {
      /* 老用户：密码不参与判定，只更新登录时间 */
      accounts[idx].password_set = true;
      accounts[idx].last_login = Date.now();
    }

    const user = publicUser(accounts[idx]);
    const headers = jsonHeaders([writeAccounts(accounts), setCookie('hs_user', JSON.stringify(user))]);
    return new Response(JSON.stringify({
      ok: true,
      user,
      auth_mode: 'lenient',
      is_returning: isReturning,
      message: isReturning ? ('Chào mừng trở lại, ' + user.name) : 'Đăng nhập thành công',
    }), { status: 200, headers });
  }

  /* -------- 注册 -------- */
  if (path.endsWith('/register')) {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const phone = String(body.phone || '').trim();
    const password = String(body.password || '');
    const password2 = body.password2 === undefined ? password : String(body.password2);

    const fail = (field, message) => Response.json({ ok: false, field, message }, { status: 200 });
    if (!name) return fail('name', 'Vui lòng nhập họ tên.');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return fail('email', 'Email không hợp lệ.');
    if (password.length < 6) return fail('password', 'Mật khẩu tối thiểu 6 ký tự.');
    if (password !== password2) return fail('password2', 'Mật khẩu nhập lại không khớp.');
    if (body.terms === false) return fail('terms', 'Bạn cần đồng ý với điều khoản sử dụng.');

    const accounts = readAccounts(request);
    const existed = accounts.some((a) => String(a.email || '').toLowerCase() === email.toLowerCase());
    const acc = upsertAccount(accounts, email, {
      name, phone, password_set: true,
      addr: String(body.addr || ''),
      city: String(body.city || ''),
      zip: String(body.zip || ''),
      joined_at: existed ? (accounts.find((a) => String(a.email || '').toLowerCase() === email.toLowerCase()).joined_at) : new Date().toLocaleDateString('vi-VN'),
      membership: 'Thành viên mới',
    });
    const user = publicUser(acc);

    const headers = jsonHeaders([writeAccounts(accounts), setCookie('hs_user', JSON.stringify(user))]);
    return new Response(JSON.stringify({ ok: true, user, existed, message: existed ? 'Cập nhật tài khoản thành công' : 'Đăng ký thành công' }), { status: 200, headers });
  }

  /* -------- 退出 -------- */
  if (path.endsWith('/logout')) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: jsonHeaders([setCookie('hs_user', '', 0)]),
    });
  }

  /* -------- 更新资料 -------- */
  if (path.endsWith('/update')) {
    const accounts = readAccounts(request);
    let cur = null;
    try { cur = JSON.parse(readCookie(request, 'hs_user') || 'null'); } catch (e) {}
    if (!cur || !cur.email) return Response.json({ ok: false, code: 'not_logged_in' }, { status: 200 });
    const patch = {};
    ['name', 'phone', 'addr', 'city', 'zip'].forEach((k) => { if (body[k] !== undefined) patch[k] = String(body[k]); });
    const acc = upsertAccount(accounts, cur.email, patch);
    return new Response(JSON.stringify({ ok: true, user: publicUser(acc) }), {
      status: 200,
      headers: jsonHeaders([writeAccounts(accounts), setCookie('hs_user', JSON.stringify(publicUser(acc)))]),
    });
  }

  return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');

  if (path.endsWith('/me')) {
    let user = null;
    try { user = JSON.parse(readCookie(request, 'hs_user') || 'null'); } catch (e) {}
    /* 会话不存在但账号表里有记录：直接带出最后一个账号（老用户免登录体验） */
    let restored = false;
    if (!user) {
      const accounts = readAccounts(request);
      if (accounts.length) {
        user = publicUser(accounts[accounts.length - 1]);
        restored = true;
      }
    }
    return Response.json({ user, restored }, { headers: { 'Cache-Control': 'no-store' } });
  }

  if (path.endsWith('/accounts')) {
    const accounts = readAccounts(request);
    return Response.json({ accounts: accounts.map((a) => ({ email: a.email, name: a.name })) }, { headers: { 'Cache-Control': 'no-store' } });
  }

  return Response.json({ ok: false }, { status: 404 });
}
