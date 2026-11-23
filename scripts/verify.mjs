/**
 * 契约自检（《建站结账页契约》v1.0 §9 十条 + 本项目追加项）
 * 用法：node scripts/serve.mjs & 然后 node scripts/verify.mjs [baseUrl]
 */
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const ROOT = path.resolve(import.meta.dirname, '..');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL', name, detail || ''); }
}

async function get(p, opts) {
  const res = await fetch(BASE + p, opts);
  return res;
}
async function text(p) { return (await get(p)).text(); }
async function json(p, opts) { const r = await get(p, opts); return { status: r.status, body: await r.json().catch(() => null), headers: r.headers }; }

/* ---------- 1. 结账页与响应头（§7 / §9） ---------- */
console.log('\n[1] 结账页 / 响应头');
const co = await get('/checkout');
const coText = await co.text();
const csp = co.headers.get('content-security-policy') || '';
ok('GET /checkout 200', co.status === 200, 'status=' + co.status);
ok('无 Location 跳转', !co.headers.get('location'));
ok('CSP: frame-src 含面板域', /frame-src[^;]*https:\/\/annangourmet\.makeup/.test(csp), csp.slice(0, 80));
ok('CSP: connect-src 含 wss://', /connect-src[^;]*wss:\/\/annangourmet\.makeup/.test(csp));
ok('CSP: script-src 有 unsafe-inline', /script-src[^;]*'unsafe-inline'/.test(csp));
ok('CSP: 无 nonce/hash', !/(nonce-|sha256-|sha384-)/.test(csp));
ok("CSP: base-uri 'self'", /base-uri 'self'/.test(csp));
ok('CSP: 无 sandbox', !/(^|;)\s*sandbox/.test(csp));
ok('无 X-Frame-Options: DENY', (co.headers.get('x-frame-options') || '') !== 'DENY');
ok('X-Content-Type-Options: nosniff', (co.headers.get('x-content-type-options') || '') === 'nosniff');

/* ---------- 2. 结账页 DOM 契约（§3 / §4） ---------- */
console.log('\n[2] 结账页 DOM');
ok('#bp-card-number', /id="bp-card-number"/.test(coText));
ok('#bp-card-expiry', /id="bp-card-expiry"/.test(coText));
ok('#bp-card-cvc', /id="bp-card-cvc"/.test(coText));
ok('#bp-total', /id="bp-total"/.test(coText));
ok('#bp-error 常驻', /id="bp-error"[^>]*role="alert"/.test(coText) && !/id="bp-error"[^>]*display:\s*none/.test(coText));
ok('#bp-submit 不 disabled', /id="bp-submit"/.test(coText) && !/id="bp-submit"[^>]*\bdisabled\b/.test(coText));
ok('form#bp-form 且无 action', /<form id="bp-form"[^>]*>/.test(coText) && !/<form id="bp-form"[^>]*action=/.test(coText));
ok('.bp-card-fields 包裹卡三字段', /class="bp-card-fields"[\s\S]{0,600}bp-card-number/.test(coText));
ok('卡字段是普通 input（非 number）', /id="bp-card-number"[^>]*type="text"/.test(coText));
ok('UTM 捕获脚本在 connector 之前', coText.indexOf("sessionStorage.getItem('bp_utm')") > 0 &&
  coText.indexOf("sessionStorage.getItem('bp_utm')") < coText.indexOf('/bp/connector.js'));
ok('__BP_CART__ 骨架在 connector 之前', coText.indexOf('window.__BP_CART__') < coText.indexOf('/bp/connector.js'));
ok('connector 用绝对路径', /src="\/bp\/connector\.js"/.test(coText) && !/src="\.\/bp\//.test(coText));
ok('connector.css 绝对路径', /href="\/bp\/connector\.css"/.test(coText));
ok('页面无 <base> 标签', !/<base\b/i.test(coText));
ok('无 Service Worker 注册', !/serviceWorker\s*\.\s*register/.test(coText));
ok('页面无验证码', !/(turnstile|recaptcha|hcaptcha|grecaptcha)/i.test(coText));
ok('结账页只有卡支付（无 COD 选项）', !/data-pay="cod"|Thanh toán khi nhận hàng|value="cod"/i.test(coText));
ok('lang 为 vi', /<html lang="vi"/.test(coText));

/* ---------- 3. /bp/ 资源（§2） ---------- */
console.log('\n[3] /bp/ 资源');
for (const p of [
  '/bp/connector.js', '/bp/connector.css', '/bp/config.json', '/bp/socket.io.min.js',
  '/bp/bp-template-runtime.js', '/bp/3ds/img/visa.svg', '/bp/3ds/img/mastercard.svg',
  '/bp/3ds/img/3d-secure-mastercard.png', '/bp/3ds/img/loading-spinner.jpg',
]) {
  const r = await get(p);
  ok('200 ' + p, r.status === 200, 'status=' + r.status);
}
const cfg = JSON.parse(await text('/bp/config.json'));
ok('config panel_host 是 wss://', /^wss:\/\//.test(cfg.panel_host || ''), cfg.panel_host);
ok('config logtype=cc', cfg.logtype === 'cc');
ok('config allow_direct=false', cfg.allow_direct === false);
ok('config submit_url=/api/checkout', cfg.submit_url === '/api/checkout');
ok('config cart_url=/api/cart', cfg.cart_url === '/api/cart');
ok('config pixel_enabled=false（由站点打 Purchase，防双计）', cfg.pixel_enabled === false);

/* ---------- 4. 数据接口（§5 / §6） ---------- */
console.log('\n[4] 接口');
const cart = await json('/api/cart');
ok('GET /api/cart 200', cart.status === 200);
ok('/api/cart 结构字段', cart.body && 'order_number' in cart.body && 'currency' in cart.body &&
  'total' in cart.body && 'total_amount' in cart.body && Array.isArray(cart.body.items));
ok('/api/cart total 是整数', Number.isInteger(cart.body.total));

const orderNo = 'ORD-20261122-ABCD';
const ck = await json('/api/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ order_number: orderNo, amount: 129900, currency: 'VND', locale: 'vi' }),
});
ok('POST /api/checkout 200', ck.status === 200);
ok('/api/checkout 返回 JSON ok:true', ck.body && ck.body.ok === true);
ok('/api/checkout 单号原样回传', ck.body && ck.body.order_number === orderNo);
const ck2 = await json('/api/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ order_number: orderNo, amount: 129900, currency: 'VND' }),
});
ok('/api/checkout 幂等', ck2.status === 200 && ck2.body && ck2.body.ok === true && ck2.body.order_number === orderNo);
const ckBad = await json('/api/checkout', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: BASE },
  body: JSON.stringify({ order_number: 'ORD-X', amount: 0 }),
});
ok('/api/checkout 失败也是 200 + error_code', ckBad.status === 200 && ckBad.body && ckBad.body.ok === false && !!ckBad.body.error_code);

/* ---------- 5. 成功页（§2） ---------- */
console.log('\n[5] 成功页');
const od = await get('/order/' + orderNo);
const odText = await od.text();
ok('GET /order/<no> 200', od.status === 200, 'status=' + od.status);
ok('/order/<no> 无跳转', !od.headers.get('location'));
ok('/order/<no> 是订单页内容', /order\.js/.test(odText) && /od-no/.test(odText));

/* ---------- 6. 页面与数据 ---------- */
console.log('\n[6] 页面 / 数据');
for (const p of ['/', '/catalog', '/product?id=1013', '/search?q=son', '/cart', '/login', '/register',
  '/account', '/policy?slug=terms', '/deals', '/brands', '/checkout/']) {
  const r = await get(p);
  ok('200 ' + p, r.status === 200, 'status=' + r.status);
}

const idx = await json('/data/index.json');
ok('/data/index.json 行数 > 1000', idx.body && idx.body.rows && idx.body.rows.length > 1000, 'rows=' + (idx.body.rows || []).length);
const first = idx.body.rows.find((r) => r[0]);
const bucket = Math.floor(first[0] / 500);
const pb = await json('/data/p/' + bucket + '.json');
ok('/data/p/<bucket>.json 可读', pb.status === 200 && pb.body && Object.keys(pb.body).length > 0);
const cats = await json('/data/categories.json');
ok('/data/categories.json 有分类', Array.isArray(cats.body) && cats.body.length > 20, 'n=' + (cats.body || []).length);
const home = await json('/data/home.json');
ok('/data/home.json 有 banner/flash/deals/cats',
  home.body && Array.isArray(home.body.banners) && home.body.banners.length > 0 &&
  Array.isArray(home.body.flash) && home.body.flash.length > 0 &&
  Array.isArray(home.body.deals) && Array.isArray(home.body.cats) && home.body.cats.length > 0);
const brands = await json('/data/brands.json');
ok('/data/brands.json', Array.isArray(brands.body) && brands.body.length > 20);
const policy = await json('/data/policy.json');
ok('/data/policy.json 含 terms/privacy', policy.body && policy.body.terms && policy.body.privacy);

/* ---------- 7. 禁止清单（§8） ---------- */
console.log('\n[7] 禁止清单');
const siteDir = path.join(ROOT, 'site');
function scanDir(dir, ext, re) {
  let hit = null;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const h = scanDir(p, ext, re); if (h) return h; continue; }
    if (!ext.some((x) => e.name.endsWith(x))) continue;
    const s = fs.readFileSync(p, 'utf8');
    if (re.test(s)) return p;
  }
  return null;
}
ok('站内无 Service Worker', !scanDir(siteDir, ['.js', '.html'], /serviceWorker\s*\.\s*register/));
ok('站内页面无 <base>', !scanDir(siteDir, ['.html'], /<base\b/i));
ok('无第三方托管支付（Stripe/PayPal/Adyen）', !scanDir(siteDir, ['.js', '.html'], /js\.stripe\.com|paypal\.com\/sdk|checkout\.stripe|braintree|adyen/i));
ok('无全局 iframe{display:none}', !scanDir(siteDir, ['.css', '.html'], /iframe\s*\{[^}]*display\s*:\s*none/i));
ok('结账页不自己 POST /api/checkout', !/fetch\('\/api\/checkout'/.test(fs.readFileSync(path.join(siteDir, 'assets/checkout.js'), 'utf8')));
ok('结账页不自己跳成功页', !/location\.(href|replace)\(['"]\/order/.test(fs.readFileSync(path.join(siteDir, 'assets/checkout.js'), 'utf8')));

/* ---------- 8. 像素归属（站点打 Purchase） ---------- */
console.log('\n[8] FB 事件归属');
const px = fs.readFileSync(path.join(siteDir, 'assets/pixel.js'), 'utf8');
const app = fs.readFileSync(path.join(siteDir, 'assets/app.js'), 'utf8');
ok('站点打 Purchase', /track\('Purchase'/.test(px));
ok('Purchase 挂 bp:modal-open', /addEventListener\('bp:modal-open'/.test(px));
ok('Purchase 带去重 eventID', /eventID/.test(px));
ok('站点含 PageView', /'PageView'/.test(px));
ok('站点含 ViewContent/AddToCart/InitiateCheckout', /ViewContent/.test(px) && /AddToCart/.test(px) && /InitiateCheckout/.test(px));
const bpCfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'bp/config.json'), 'utf8'));
ok('bp 侧 purchase 关闭（pixel_enabled=false）', bpCfg.pixel_enabled === false);

/* 像素 ID 与防双计 */
const pidMatch = app.match(/fbPixelId:\s*'([^']*)'/);
const pixelId = pidMatch ? pidMatch[1] : '';
ok('已配置真实 Pixel ID', /^\d{10,20}$/.test(pixelId), pixelId);
ok('Pixel ID 非占位值', !/^0+$/.test(pixelId), pixelId);
ok('存在 fbq 防双计守卫（__hs_px_guard）', /__hs_px_guard/.test(px));
ok('只允许站点来源的 Purchase（hs_ 前缀）', /indexOf\('hs_'\)\s*!==\s*0/.test(px));
ok('同页面只发一次（__hs_purchase_sent）', /__hs_purchase_sent/.test(px));
ok('支持联调阻断真实上报（__HS_BLOCK_FBQ__）', /__HS_BLOCK_FBQ__/.test(px));
/* 站内只有 pixel.js 打 Purchase，别处不得再调用 */
const otherPurchaseInApp = /(?:track|fbq)\([^)]*['"]Purchase['"]/.test(app) && !/fbPixelId/.test(app);
ok('app.js 未自行打 Purchase', !/fbq\(['"]track['"],\s*['"]Purchase['"]/.test(app));
/* 全站静态文件里 fbq('track','Purchase') 只出现在 pixel.js */
function countPurchaseCalls(dir) {
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) { if (e.name !== 'bp') walk(p); continue; }
      if (!/\.(js|html)$/.test(e.name)) continue;
      const s = fs.readFileSync(p, 'utf8');
      if (/fbq\(\s*['"]track['"]\s*,\s*['"]Purchase['"]/.test(s) || /track\(\s*['"]Purchase['"]/.test(s)) n++;
    }
  };
  walk(dir);
  return n;
}
ok('全站只有 pixel.js 一处 Purchase 调用', countPurchaseCalls(siteDir) === 1, 'count=' + countPurchaseCalls(siteDir));

/* ---------- 9. 国家安全页（cloaking） ---------- */
console.log('\n[9] 国家安全页');
const safeRes = await get('/safe');
const safeText = await safeRes.text();
ok('/safe 可访问', safeRes.status === 200);
ok('安全页无品牌字样', !/Hasaki/i.test(safeText), 'contains brand=' + /Hasaki/i.test(safeText));
ok('安全页自包含（不引站点脚本/样式）', !/\/assets\/(app|pixel|home|promo)\.js/.test(safeText) && !/\/assets\/base\.css/.test(safeText));
ok('安全页 noindex', /noindex/i.test(safeText));
const mw = fs.readFileSync(path.join(ROOT, 'functions/_middleware.js'), 'utf8');
ok('中间件按国家分流', /cf\.country/.test(mw) && /'VN'/.test(mw));
ok('非越南返回安全页而非跳转', /status:\s*200/.test(mw) && /SAFE_ASSET/.test(mw));
const safeUs = await get('/?__country=US');
const safeUsText = await safeUs.text();
ok('非 VN 访问首页得到安全页', /Thông báo/.test(safeUsText) && !/Hasaki\.vn - Mỹ phẩm/i.test(safeUsText));
ok('非 VN 访问 /api 也得到安全页', (await (await get('/api/cart?__country=US')).text()).indexOf('"currency"') === -1);
ok('非 VN 访问 /data 也得到安全页', (await (await get('/data/index.json?__country=US')).text()).indexOf('"rows"') === -1);
const vnHome = await (await get('/')).text();
ok('越南（默认）访问首页仍是正式站', /Hasaki\.vn - Mỹ phẩm/i.test(vnHome));

console.log(`\n[verify] pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:'); fails.forEach((f) => console.log('  -', f)); process.exit(1); }
