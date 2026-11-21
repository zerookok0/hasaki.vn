/**
 * raw/ → data/ 构建
 *  - data/index.json     全量轻量索引（紧凑行）
 *  - data/p/<bucket>.json 商品详情（bucket = floor(id/500)）
 *  - data/rv/<bucket>.json 评分分布 + 评论
 *  - data/cat/<slug>.json 末级类目的行
 *  - data/categories.json 分类树（一级/二级/三级 + 计数）
 *  - data/home.json      首页区块素材
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const DATA = path.join(ROOT, 'data');

const DISCOUNT = 0.6;

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'khac';
}

/* ---------- HTML 实体解码（原站正文里大量越南语实体） ---------- */
const ENT = {
  agrave: 'à', aacute: 'á', acirc: 'â', atilde: 'ã', auml: 'ä', aring: 'å', aelig: 'æ',
  egrave: 'è', eacute: 'é', ecirc: 'ê', euml: 'ë', igrave: 'ì', iacute: 'í', icirc: 'î', iuml: 'ï',
  ograve: 'ò', oacute: 'ó', ocirc: 'ô', otilde: 'õ', ouml: 'ö', oslash: 'ø',
  ugrave: 'ù', uacute: 'ú', ucirc: 'û', uuml: 'ü', yacute: 'ý', yuml: 'ÿ',
  Agrave: 'À', Aacute: 'Á', Acirc: 'Â', Atilde: 'Ã', Auml: 'Ä', Aring: 'Å',
  Egrave: 'È', Eacute: 'É', Ecirc: 'Ê', Igrave: 'Ì', Iacute: 'Í',
  Ograve: 'Ò', Oacute: 'Ó', Ocirc: 'Ô', Otilde: 'Õ', Ouml: 'Ö',
  Ugrave: 'Ù', Uacute: 'Ú', Ucirc: 'Û', Uuml: 'Ü', Yacute: 'Ý',
  dstrok: 'đ', Dstrok: 'Đ', eth: 'ð', thorn: 'þ',
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', times: '×',
  copy: '©', reg: '®', trade: '™', deg: '°', middot: '·', bull: '•',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', dollar: '$', euro: '€', pound: '£',
};
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (m, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (m, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, n) => (ENT[n] !== undefined ? ENT[n] : m));
}
/* 只保留安全标签，去掉 on* 与 javascript: */
function sanitizeHtml(s) {
  return decodeEntities(s)
    .replace(/<(script|style|iframe|object|embed|form|input|button|textarea|select)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<\s*(script|style|iframe|object|embed|input|link|meta)\b[^>]*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/style="[^"]*font-family:[^"]*"/gi, '');
}

function salePrice(market) {
  const m = Number(market) || 0;
  if (m <= 0) return 0;
  return Math.round((m * DISCOUNT) / 100) * 100;
}

function mkdirs() {
  ['p', 'rv', 'cat'].forEach((d) => fs.mkdirSync(path.join(DATA, d), { recursive: true }));
}
mkdirs();

const dir = path.join(RAW, 'detail');
const files = fs.readdirSync(dir).filter((f) => /^\d+\.json$/.test(f));
console.log('detail files:', files.length);

const catTree = new Map(); // id -> {id,name,parent,level,count}
const brandMap = new Map(); // name -> {name,image,count}
const buckets = new Map(); // bucket -> {}
const rvBuckets = new Map(); // bucket -> {}
const catRows = new Map(); // catSlug -> {name, rows:[]}
const indexRows = [];
const heroPool = { flash: [], best: [], top: [] };

let processed = 0, dead = 0;

for (const f of files) {
  let p;
  try { p = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { continue; }
  if (!p || p.dead) { dead++; continue; }

  const market = Number(p.market_price) || Number(p.price) || 0;
  const sale = salePrice(market);
  if (!market || !sale) { dead++; continue; }
  /* 原站本身没有图的 SKU 也照样收录（前端用占位图），保证"全量商品" */
  const img = (p.gallery && p.gallery[0]) || '';

  // 分类路径
  const cats = (p.cats || []).filter((c) => c && c.id && c.name);
  cats.forEach((c, i) => {
    const rec = catTree.get(c.id) || { id: c.id, name: c.name, parent: i > 0 ? cats[i - 1].id : 0, level: i + 1, count: 0 };
    rec.count++;
    catTree.set(c.id, rec);
  });
  const leaf = cats.length ? cats[cats.length - 1] : null;
  const leafSlug = leaf ? slugify(leaf.name) : 'khac';
  const leafName = leaf ? leaf.name : 'Khác';

  // 品牌
  const bname = (p.brand && p.brand.name) || '';
  if (bname) {
    const b = brandMap.get(bname) || { name: bname, image: (p.brand && p.brand.image) || '', count: 0 };
    b.count++;
    if (!b.image && p.brand && p.brand.image) b.image = p.brand.image;
    brandMap.set(bname, b);
  }

  // 评论：优先用评论接口，缺失时回落到详情里自带的首屏评论
  let rv = null;
  try {
    const rf = path.join(RAW, 'reviews', f);
    if (fs.existsSync(rf)) rv = JSON.parse(fs.readFileSync(rf, 'utf8'));
  } catch (e) {}
  if ((!rv || !Array.isArray(rv.items) || !rv.items.length) && Array.isArray(p.reviews) && p.reviews.length) {
    rv = {
      total: (p.rating_short && p.rating_short.total) || p.reviews.length,
      items: p.reviews.map((r) => ({
        id: 0, content: r.content, like: 0, at: r.at, user: r.user,
        root: false, star: r.star, replies: r.reply ? [{ user: 'Hasaki', content: r.reply }] : [], imgs: r.imgs || [],
      })),
    };
  }

  const rating = p.rating || { avg: 0, total: 0 };
  const dealPct = p.deal && p.deal.percent ? p.deal.percent : 0;
  const row = [p.id, p.name, bname, market, sale, img, leafName, rating.avg || 0, rating.total || 0, p.bought_count || 0, dealPct];
  indexRows.push(row);

  const detail = {
    id: p.id, sku: p.sku, name: p.name, en: p.en || '', cat_name: leafName, cat_slug: leafSlug,
    brand: p.brand ? { name: p.brand.name, image: p.brand.image || '' } : null,
    market_price: market, sale, price: p.price || market,
    quantity: p.quantity || 0, bought_count: p.bought_count || 0,
    deal: p.deal || null, rating: rating, comment_total: p.comment_total || 0,
    now_free: !!p.now_free, announce: p.announce || '',
    gallery: (p.gallery || []).slice(0, 8), cats,
    promo: p.promo || '', promos: p.promos || [], badge: p.badge || null,
    desc: sanitizeHtml(p.desc || '').slice(0, 24000),
    spec: (p.spec || []).slice(0, 40).map((r) => [decodeEntities(r[0]), decodeEntities(r[1])]),
    ingr: sanitizeHtml(p.ingr || '').slice(0, 10000),
    guide: sanitizeHtml(p.guide || '').slice(0, 6000),
    reviews: (p.reviews || []).map((r) => ({
      content: r.content || '', user: r.user || '', star: r.star || 5, at: r.at || 0, reply: r.reply || '', imgs: r.imgs || [],
    })),
    img,
  };
  const bk = String(Math.floor(p.id / 500));
  if (!buckets.has(bk)) buckets.set(bk, {});
  buckets.get(bk)[String(p.id)] = detail;

  if (rv && (rv.items || []).length) {
    if (!rvBuckets.has(bk)) rvBuckets.set(bk, {});
    rvBuckets.get(bk)[String(p.id)] = {
      total: rv.total || (rv.items || []).length,
      items: rv.items.slice(0, 6),
    };
  }

  if (!catRows.has(leafSlug)) catRows.set(leafSlug, { name: leafName, rows: [] });
  catRows.get(leafSlug).rows.push(row);

  // 首页候选池
  const dealPct2 = dealPct;
  if (dealPct2 >= 40) heroPool.flash.push({ row, dealPct: dealPct2 });
  heroPool.best.push({ row, rateTotal: rating.total || 0 });
  heroPool.top.push({ row, rate: (rating.avg || 0) * Math.log10((rating.total || 1) + 10) });

  processed++;
  if (processed % 5000 === 0) console.log('  parsed', processed);
}

console.log('valid', processed, 'dead', dead, 'categories', catTree.size, 'brands', brandMap.size);

/* ---------- index.json ---------- */
fs.writeFileSync(path.join(DATA, 'index.json'), JSON.stringify({ v: 1, currency: 'VND', discount: DISCOUNT, rows: indexRows }));
console.log('index.json', (fs.statSync(path.join(DATA, 'index.json')).size / 1e6).toFixed(1), 'MB', indexRows.length, 'rows');

/* ---------- buckets ---------- */
for (const [k, v] of buckets) fs.writeFileSync(path.join(DATA, 'p', k + '.json'), JSON.stringify(v));
for (const [k, v] of rvBuckets) fs.writeFileSync(path.join(DATA, 'rv', k + '.json'), JSON.stringify(v));
console.log('p buckets', buckets.size, 'rv buckets', rvBuckets.size);

/* ---------- 分类树 ---------- */
const cats = [...catTree.values()].sort((a, b) => a.level - b.level || b.count - a.count);
const catOut = cats.map((c) => ({ ...c, slug: slugify(c.name) }));
fs.writeFileSync(path.join(DATA, 'categories.json'), JSON.stringify(catOut));

/* ---------- 类目行 ---------- */
const MAX_ROWS = 2000;
for (const [slug, obj] of catRows) {
  fs.writeFileSync(path.join(DATA, 'cat', slug + '.json'), JSON.stringify({ slug, name: obj.name, rows: obj.rows.slice(0, MAX_ROWS) }));
}
console.log('cat files', catRows.size);

/* ---------- brands.json（品牌墙） ---------- */
const brandsOut = [...brandMap.values()].sort((a, b) => b.count - a.count)
  .map((b) => ({ name: b.name, img: b.image || '', count: b.count }));
fs.writeFileSync(path.join(DATA, 'brands.json'), JSON.stringify(brandsOut));
console.log('brands.json', brandsOut.length);

/* ---------- home.json ---------- */
const pickRows = (arr, n, key) => arr.sort((a, b) => b[key] - a[key]).slice(0, n).map((x) => x.row);
const toProd = (r) => ({ id: r[0], name: r[1], brandName: r[2], market_price: r[3], sale: r[4], img: r[5], cat: r[6], rate: r[7], rateCount: r[8], popular: r[9], dealPercent: r[10] || 0 });

const topCats = cats.filter((c) => c.level === 1).slice(0, 10);
const tileCats = [];
for (const c of cats.filter((x) => x.level === 2).sort((a, b) => b.count - a.count)) {
  if (tileCats.length >= 9) break;
  const rows = catRows.get(slugify(c.name));
  const img = rows && rows.rows[0] ? rows.rows[0][5] : '';
  if (img) tileCats.push({ slug: slugify(c.name), name: c.name, img, count: c.count });
}
const brandsTop = [...brandMap.values()].filter((b) => b.image && b.count > 3).sort((a, b) => b.count - a.count).slice(0, 12);

const BANNERS = JSON.parse(fs.readFileSync(path.join(RAW, 'banners.json'), 'utf8'));

const home = {
  hero: BANNERS.hero,
  heroSide: BANNERS.heroSide,
  brandbar: brandsTop.slice(0, 4).map((b) => b.image).filter(Boolean),
  promo: BANNERS.promo,
  subBanners: BANNERS.subBanners,
  quick: [
    { icon: 'deal', label: 'Siêu Deal 7 Ngày', href: '/deals' },
    { icon: 'spark', label: 'Deal Đỉnh', href: '/deals' },
    { icon: 'phone', label: 'Phụ Kiện Điện Thoại', href: '/catalog' },
    { icon: 'speaker', label: 'Thiết Bị Âm Thanh', href: '/catalog' },
    { icon: 'clean', label: 'Vệ Sinh Nhà Cửa', href: '/catalog' },
    { icon: 'bag', label: 'Balo & Túi Xách', href: '/catalog' },
    { icon: 'baby', label: 'Sản Phẩm Cho Bé', href: '/catalog' },
    { icon: 'clock', label: 'Đặt Hẹn Clinic', href: '/policy?slug=clinic' },
  ],
  flash: pickRows(heroPool.flash, 6, 'dealPct').map((r) => ({ ...toProd(r) })),
  cats: tileCats,
  brands: brandsTop.map((b) => ({ name: b.name, img: b.image })),
  best: pickRows(heroPool.best, 6, 'rateTotal').map(toProd),
  topSearch: pickRows(heroPool.top, 6, 'rate').map(toProd),
  stats: { products: indexRows.length, categories: cats.length, brands: brandMap.size },
};
fs.writeFileSync(path.join(DATA, 'home.json'), JSON.stringify(home));
console.log('home.json ok; stats', JSON.stringify(home.stats));
