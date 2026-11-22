/**
 * 本地预览：模拟 Cloudflare Pages 的 clean URL 路由 + Functions（/api/*、/order/*）。
 * 用法：node scripts/serve.mjs [port]
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

/* ---------- 复用 functions 里的逻辑（ESM 直引） ---------- */
const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.argv[2] || 4173);

const { onRequestPost: checkoutPost } = await import(pathToUrl(path.join(ROOT, 'functions/api/checkout.js')));
const { onRequestGet: cartGet } = await import(pathToUrl(path.join(ROOT, 'functions/api/cart.js')));
const { onRequestPost: custPost, onRequestGet: custGet } = await import(pathToUrl(path.join(ROOT, 'functions/api/customer/[[action]].js')));
const orderFn = await import(pathToUrl(path.join(ROOT, 'functions/order/[[path]].js')));

function pathToUrl(p) { return 'file:///' + p.replace(/\\/g, '/').replace(/^\//, ''); }

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https://annangourmet.makeup wss://annangourmet.makeup https://connect.facebook.net https://www.facebook.com",
  "frame-src 'self' https://annangourmet.makeup https://www.facebook.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.gif': 'image/gif', '.ico': 'image/x-icon', '.xml': 'text/xml; charset=utf-8',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp',
};

function send(res, status, body, type, extra = {}) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Content-Security-Policy': CSP,
    ...extra,
  });
  res.end(body);
}

function readFileOrNull(p) {
  try { return fs.readFileSync(p); } catch (e) { return null; }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const pathname = decodeURIComponent(url.pathname);

  /* ---- Functions ---- */
  if (pathname.startsWith('/api/customer/')) {
    const body = req.method === 'POST' ? await bodyOf(req) : undefined;
    const h = new Headers();
    if (req.headers['content-type']) h.set('content-type', req.headers['content-type']);
    if (req.headers['cookie']) h.set('cookie', req.headers['cookie']);
    const reqObj = new Request('http://127.0.0.1:' + PORT + pathname, { method: req.method, headers: h, body });
    const out = req.method === 'GET' ? await custGet({ request: reqObj }) : await custPost({ request: reqObj });
    const headers = {};
    out.headers.forEach((v, k) => { if (k.toLowerCase() !== 'set-cookie') headers[k] = v; });
    const cookies = typeof out.headers.getSetCookie === 'function' ? out.headers.getSetCookie() : [];
    if (cookies.length) headers['Set-Cookie'] = cookies.length === 1 ? cookies[0] : cookies;
    return send(res, out.status, await out.text(), headers['Content-Type'] || 'application/json', headers);
  }

  if (pathname === '/api/cart' && req.method === 'GET') {
    const h = new Headers();
    if (req.headers['cookie']) h.set('cookie', req.headers['cookie']);
    const out = await cartGet({ request: new Request('http://127.0.0.1:' + PORT + pathname, { headers: h }) });
    return send(res, out.status, await out.text(), 'application/json', { 'Cache-Control': 'no-store' });
  }

  if (pathname === '/api/checkout' && req.method === 'POST') {
    const h = new Headers();
    if (req.headers['content-type']) h.set('content-type', req.headers['content-type']);
    const out = await checkoutPost({ request: new Request('http://127.0.0.1:' + PORT + pathname, { method: 'POST', headers: h, body: await bodyOf(req) }) });
    return send(res, out.status, await out.text(), 'application/json', { 'Cache-Control': 'no-store' });
  }

  if (pathname.startsWith('/order/')) {
    const html = readFileOrNull(path.join(DIST, 'order.html'));
    if (!html) return send(res, 404, 'order.html missing');
    return send(res, 200, html, 'text/html; charset=utf-8', { 'Cache-Control': 'no-store' });
  }

  /* ---- 静态 ---- */
  let file = path.join(DIST, pathname);
  if (pathname.endsWith('/')) file = path.join(file, 'index.html');

  let buf = readFileOrNull(file);
  if (!buf && !path.extname(file)) {
    buf = readFileOrNull(file + '.html');
    if (buf) file = file + '.html';
  }
  if (!buf) {
    buf = readFileOrNull(path.join(file, 'index.html'));
    if (buf) file = path.join(file, 'index.html');
  }
  if (!buf) {
    /* 单页兜底：未知路径回首页 404 风格 */
    return send(res, 404, '<h1>404</h1><p>Not found: ' + pathname + '</p>', 'text/html; charset=utf-8');
  }
  const ext = path.extname(file).toLowerCase();
  const cache = /\/assets\//.test(pathname) ? 'public, max-age=31536000, immutable'
    : /\/bp\//.test(pathname) ? 'public, max-age=300'
      : /\/data\//.test(pathname) ? 'public, max-age=600'
        : pathname.startsWith('/checkout') || pathname.startsWith('/order/') ? 'no-store' : 'no-cache';
  send(res, 200, buf, MIME[ext] || 'application/octet-stream', { 'Cache-Control': cache });
});

function bodyOf(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[serve] http://127.0.0.1:${PORT}  (dist=${DIST})`);
});
