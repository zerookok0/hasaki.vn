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

/* 1) 页面（自动注入促销弹窗脚本） */
function injectPromo(html) {
  if (html.indexOf('/assets/promo.js') !== -1) return html;
  return html.replace(/<\/head>/i, '  <script src="/assets/promo.js" defer></script>\n</head>');
}
let pages = 0;
for (const e of fs.readdirSync(SITE, { withFileTypes: true })) {
  if (e.isFile() && e.name.endsWith('.html')) {
    const src = fs.readFileSync(path.join(SITE, e.name), 'utf8');
    fs.writeFileSync(path.join(DIST, e.name), injectPromo(src));
    pages++;
  }
}
for (const name of DIR_PAGES) {
  const src = path.join(SITE, name + '.html');
  if (!fs.existsSync(src)) continue;
  const dir = path.join(DIST, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'index.html'), injectPromo(fs.readFileSync(src, 'utf8')));
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
