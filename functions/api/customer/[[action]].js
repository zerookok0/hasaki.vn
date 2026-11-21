/**
 * 会员接口（无外部存储，账号落在 HttpOnly cookie 里，跨页面/跨会话保留）
 * 默认 lenient 模式：任何非空账号+密码都能登录（仿站演示口径）
 */
const MAX_AGE = 60 * 60 * 24 * 30;

function readCookie(request, name) {
  const c = request.headers.get('Cookie') || '';
  const m = c.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return m ? decodeURIComponent(m[1]) : '';
}

function userCookie(user) {
  const v = encodeURIComponent(JSON.stringify(user));
  return `hs_user=${v}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`;
}

function nameFromEmail(email) {
  const base = String(email || '').split('@')[0].replace(/[._-]+/g, ' ').trim();
  return base
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ') || 'Khách hàng';
}

export async function onRequestPost({ request }) {
  const url = new URL(request.url);
  const path = url.pathname;
  let body = {};
  try { body = await request.json(); } catch (e) { body = {}; }

  if (path.endsWith('/login')) {
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!email || !password) {
      return Response.json({ ok: false, code: 'missing_fields', message: 'Vui lòng nhập email và mật khẩu.' });
    }
    let prev = null;
    try { prev = JSON.parse(readCookie(request, 'hs_accounts') || 'null'); } catch (e) {}
    const user = {
      id: 'HS' + Math.abs(hash(email)).toString(36).toUpperCase().slice(0, 8),
      name: nameFromEmail(email),
      email,
      phone: (prev && prev.phone) || '',
      membership: (prev && prev.membership) || 'Thành viên mới',
      joined_at: (prev && prev.joined_at) || new Date().toLocaleDateString('vi-VN'),
      points: (prev && prev.points) || 0,
    };
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', userCookie(user));
    return new Response(JSON.stringify({ ok: true, user, auth_mode: 'lenient' }), { status: 200, headers });
  }

  if (path.endsWith('/register')) {
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const password = String(body.password || '');
    if (!name) return Response.json({ ok: false, field: 'name', message: 'Vui lòng nhập họ tên.' });
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return Response.json({ ok: false, field: 'email', message: 'Email không hợp lệ.' });
    if (password.length < 6) return Response.json({ ok: false, field: 'password', message: 'Mật khẩu tối thiểu 6 ký tự.' });
    if (body.password2 !== undefined && body.password !== body.password2) return Response.json({ ok: false, field: 'password2', message: 'Mật khẩu nhập lại không khớp.' });
    if (body.terms === false) return Response.json({ ok: false, field: 'terms', message: 'Bạn cần đồng ý với điều khoản.' });

    const user = {
      id: 'HS' + Math.abs(hash(email)).toString(36).toUpperCase().slice(0, 8),
      name, email, phone: String(body.phone || ''),
      membership: 'Thành viên mới', joined_at: new Date().toLocaleDateString('vi-VN'), points: 0,
    };
    const profile = { name, email, phone: user.phone, addr: String(body.addr || ''), city: String(body.city || ''), zip: String(body.zip || '') };
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', userCookie(user));
    headers.append('Set-Cookie', `hs_profile=${encodeURIComponent(JSON.stringify(profile))}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`);
    return new Response(JSON.stringify({ ok: true, user }), { status: 200, headers });
  }

  if (path.endsWith('/logout')) {
    const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    headers.append('Set-Cookie', 'hs_user=; Path=/; Max-Age=0; SameSite=Lax');
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
  }

  return Response.json({ ok: false, code: 'not_found' }, { status: 404 });
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  if (!url.pathname.endsWith('/me')) return Response.json({ ok: false }, { status: 404 });
  let user = null;
  try { user = JSON.parse(readCookie(request, 'hs_user') || 'null'); } catch (e) {}
  return Response.json({ user }, { headers: { 'Cache-Control': 'no-store' } });
}

function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
