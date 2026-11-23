/**
 * 构建 dist/：site + public + data + bp → dist
 * 规则：
 *  - site/*.html 复制到 dist 根，并为每个页面额外生成 <name>/index.html（尾斜杠形态也 200，契约 §2）
 *  - public/* 直接铺到 dist 根（_headers / _redirects / favicon）
 *  - data/ → dist/data，bp/ → dist/bp（一个字节不改）
 *  - functions/ 由 Pages 直接读取，不参与构建
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const SITE = path.join(ROOT, 'site');
const PUBLIC = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const BP = path.join(ROOT, 'bp');

/* 需要同时提供 <name>/index.html 的页面（契约要求 /checkout 接受尾斜杠且不 301） */
const DIR_PAGES = [
  'checkout', 'product', 'catalog', 'search', 'cart', 'login', 'register',
  'account', 'policy', 'deals', 'brands',
];

function rm(p) { fs.rmSync(p, { recursive: true, force: true }); }
function cpDir(src, dst, filter) {
  if (!fs.existsSync(src)) return 0;
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) n += cpDir(s, d, filter);
    else if (!filter || filter(s, e.name)) { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

rm(DIST);
fs.mkdirSync(DIST, { recursive: true });

/* 1) 页面（自动注入促销弹窗脚本；安全页单独注入真实商品卡） */
function money(n) {
  return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' ₫';
}

/** 从主站数据里挑 12 个商品（有图 + 有价 + 有评分，跨类目），做成安全页的展示卡 */
function safeProductCards() {
  let rows = [];
  try {
    const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
    rows = idx.rows || [];
  } catch (e) { return ''; }

  const byCat = new Map();
  /* 排除带促销角标/水印的图（这类图上印着站点名，安全页不能出现） */
  const BAD_IMG = /(top_fb_ads|top_deal|promotions-auto|facebook-dynamic|tem-phu|google-shopping|special-deal|_ads_|banner)/i;
  /* 只从美妆/个护类目里挑（避免童鞋、纸尿裤、家电这类和"美妆店"不符的商品） */
  const OK_CAT = /(Sữa Rửa Mặt|Son |Son Kem|Kem |Serum|Toner|Mặt Nạ|Tẩy Trang|Dầu Gội|Sữa Tắm|Xịt Khoáng|Nước Hoa|Trang Điểm|Tẩy Tế Bào|Dưỡng|Chăm Sóc|Làm Sạch|Xà Phòng|Sữa Dưỡng)/i;
  for (const r of rows) {
    if (!r[5] || !r[4] || !r[8]) continue;          // 有图 / 有价 / 有评分
    if (BAD_IMG.test(r[5])) continue;               // 跳过促销图
    const cat = r[6] || 'Khác';
    if (!OK_CAT.test(cat)) continue;                // 只要美妆个护类目
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(r);
  }
  /* 每个类目只取 1 个，保证 12 个商品来自 12 个不同类目 */
  const cats = [...byCat.entries()].filter(([, v]) => v.length >= 3).sort((a, b) => b[1].length - a[1].length);
  const picks = [];
  for (const [, list] of cats) {
    if (picks.length >= 12) break;
    list.sort((a, b) => (b[8] || 0) - (a[8] || 0));
    picks.push(list[0]);
  }
  if (picks.length < 12) {
    for (const r of rows) {
      if (picks.length >= 12) break;
      if (!r[5] || !r[4] || !r[8] || BAD_IMG.test(r[5]) || !OK_CAT.test(r[6] || '')) continue;
      if (picks.some((x) => x[0] === r[0])) continue;
      picks.push(r);
    }
  }

  return picks.slice(0, 12).map((r) => {
    const name = String(r[1] || '').replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]));
    const cat = String(r[6] || 'Khác').replace(/[<>&]/g, '');
    const rate = Number(r[7]) ? '★ ' + Number(r[7]).toFixed(1) + ' (' + (r[8] || 0) + ')' : '';
    const old = r[3] > r[4] ? ' <s>' + money(r[3]) + '</s>' : '';
    return '<article class="card">' +
      '<div class="media"><img src="' + r[5] + '" alt="' + name + '" loading="lazy"></div>' +
      '<div class="body">' +
      '<div class="cat-label">' + cat + (rate ? ' · ' + rate : '') + '</div>' +
      '<div class="name">' + name + '</div>' +
      '<div class="price">' + money(r[4]) + old + '</div>' +
      '<a class="link" href="/">View details</a>' +
      '</div></article>';
  }).join('');
}

function injectPromo(html, name) {
  if (name === 'safe.html') {
    /* 安全页：注入真实商品卡，且绝不注入站点脚本 */
    const cards = safeProductCards();
    console.log('[build] safe page product cards:', cards ? (cards.match(/<article class="card">/g) || []).length : 0);
    return html.replace('<!--SAFE_PRODUCTS-->', cards);
  }
  if (html.indexOf('/assets/promo.js') !== -1) return html;
  return html.replace(/<\/head>/i, '  <script src="/assets/promo.js" defer></script>\n</head>');
}
let pages = 0;
for (const e of fs.readdirSync(SITE, { withFileTypes: true })) {
  if (e.isFile() && e.name.endsWith('.html')) {
    const src = fs.readFileSync(path.join(SITE, e.name), 'utf8');
    fs.writeFileSync(path.join(DIST, e.name), injectPromo(src, e.name));
    pages++;
  }
}
for (const name of DIR_PAGES) {
  const src = path.join(SITE, name + '.html');
  if (!fs.existsSync(src)) continue;
  const dir = path.join(DIST, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), injectPromo(fs.readFileSync(src, 'utf8'), name + '.html'));
  pages++;
}

/* 2) 静态资源 */
const assets = cpDir(path.join(SITE, 'assets'), path.join(DIST, 'assets'));

/* 3) public */
const pub = cpDir(PUBLIC, DIST);

/* 4) data */
const dataCount = cpDir(DATA, path.join(DIST, 'data'));

/* 5) bp（原样） */
const bpCount = cpDir(BP, path.join(DIST, 'bp'));

/* 6) robots.txt */
fs.writeFileSync(path.join(DIST, 'robots.txt'), [
  'User-agent: *',
  'Allow: /',
  'Disallow: /api/',
  'Disallow: /order/',
  'Sitemap: /sitemap.xml',
  '',
].join('\n'));

/* 7) sitemap.xml（首页/类目/品牌/政策） */
const cats = fs.existsSync(path.join(DATA, 'categories.json'))
  ? JSON.parse(fs.readFileSync(path.join(DATA, 'categories.json'), 'utf8')) : [];
const urls = ['/', '/catalog', '/deals', '/brands', '/policy?slug=terms', '/policy?slug=privacy']
  .concat(cats.filter((c) => c.level <= 2).slice(0, 300).map((c) => '/catalog?slug=' + encodeURIComponent(c.slug)));
fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) => '  <url><loc>' + u.replace(/&/g, '&amp;') + '</loc></url>').join('\n') +
  '\n</urlset>\n');

const total = pages + assets + pub + dataCount + bpCount;
console.log(`[build] pages=${pages} assets=${assets} public=${pub} data=${dataCount} bp=${bpCount} total=${total}`);
console.log('[build] dist =', DIST);
