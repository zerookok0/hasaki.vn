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

/* ---------- 预加载真实评论（raw/reviews） ---------- */
const revMap = new Map();      // id -> {total, items, bars}
const revDir = path.join(RAW, 'reviews');
if (fs.existsSync(revDir)) {
  for (const f of fs.readdirSync(revDir)) {
    if (!f.endsWith('.json')) continue;
    const id = Number(f.replace('.json', ''));
    try {
      const j = JSON.parse(fs.readFileSync(path.join(revDir, f), 'utf8'));
      if (j && Array.isArray(j.items) && j.items.length) {
        const bars = [5, 4, 3, 2, 1].map((star) => ({ star, count: j.items.filter((i) => Number(i.star) === star).length }));
        revMap.set(id, { total: j.total || j.items.length, items: j.items, bars: bars.some((b) => b.count) ? bars : null });
      }
    } catch (e) {}
  }
}
console.log('products with real reviews:', revMap.size);

/* 品牌 → 有评论的商品（按评论数降序），用于「同品牌真实评价」兜底
 * 品牌/名称从上一版 data/index.json 取（避免重复解析 8,631 个大 JSON） */
const idBrand = new Map();
const idName = new Map();
try {
  const prev = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
  for (const r of prev.rows || []) { idBrand.set(r[0], r[2] || ''); idName.set(r[0], r[1] || ''); }
} catch (e) { /* 首次运行时没有 index.json，退回只按名称前缀匹配 */ }
const brandRevIndex = new Map();
for (const [id, rv] of revMap) {
  const bn = idBrand.get(id) || '';
  if (!bn) continue;
  if (!brandRevIndex.has(bn)) brandRevIndex.set(bn, []);
  brandRevIndex.get(bn).push({ id, name: idName.get(id) || '', total: rv.total || 0 });
}
for (const [k, v] of brandRevIndex) v.sort((a, b) => b.total - a.total);

/* 前缀索引：品牌 + 名称前 18 字符 → 评论数最多的同系列商品（O(1) 命中） */
const prefixIndex = new Map();
for (const [bn, list] of brandRevIndex) {
  for (const c of list) {
    const key = bn + '|' + String(c.name || '').toLowerCase().slice(0, 18);
    const cur = prefixIndex.get(key);
    if (!cur || c.total > cur.total) prefixIndex.set(key, c);
  }
}

/* 同系列匹配：同品牌 + 名称前 18 字符一致 */
function seriesReviews(product) {
  if (!product || !product.brand) return null;
  const key = product.brand.name + '|' + String(product.name || '').toLowerCase().slice(0, 18);
  const hit = prefixIndex.get(key);
  if (!hit || hit.id === product.id) return null;
  return hit;
}

let seriesMatched = 0, brandMatched = 0;

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

  /* 评论：本商品真实评论 → 详情自带首屏评价 → 同系列真实评论 → 同品牌真实评论 */
  let rv = null;
  let rvSource = '';
  const own = revMap.get(p.id);
  if (own && own.items.length) { rv = own; rvSource = 'product'; }
  if (!rv && Array.isArray(p.reviews) && p.reviews.length) {
    const bars = [5, 4, 3, 2, 1].map((star) => ({ star, count: p.reviews.filter((i) => Number(i.star) === star).length }));
    rv = {
      total: (p.rating_short && p.rating_short.total) || p.reviews.length,
      items: p.reviews.map((r) => ({
        id: 0, content: r.content, like: 0, at: r.at, user: r.user,
        root: false, star: r.star, replies: r.reply ? [{ user: 'Hasaki', content: r.reply }] : [], imgs: r.imgs || [],
      })),
      bars: bars.some((b) => b.count) ? bars : null,
    };
    rvSource = 'product';
  }
  if (!rv) {
    const s = seriesReviews({ id: p.id, brand: p.brand, name: p.name });
    const src = s && revMap.get(s.id);
    if (src) { rv = { ...src, from: s.name }; rvSource = 'series'; seriesMatched++; }
  }
  if (!rv) {
    const list = brandRevIndex.get((p.brand && p.brand.name) || '') || [];
    const c = list.find((x) => x.id !== p.id);
    const src = c && revMap.get(c.id);
    if (src) { rv = { ...src, from: c.name }; rvSource = 'brand'; brandMatched++; }
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
    desc: sanitizeHtml((p.desc || '').slice(0, 30000)).slice(0, 24000),
    spec: (p.spec || []).slice(0, 40).map((r) => [decodeEntities(r[0]), decodeEntities(r[1])]),
    ingr: sanitizeHtml((p.ingr || '').slice(0, 12000)).slice(0, 10000),
    guide: sanitizeHtml((p.guide || '').slice(0, 8000)).slice(0, 6000),
    reviews: (p.reviews || []).map((r) => ({
      content: r.content || '', user: r.user || '', star: r.star || 5, at: r.at || 0, reply: r.reply || '', imgs: r.imgs || [],
    })),
    img,
  };
  const bk = String(Math.floor(p.id / 500));
  if (!buckets.has(bk)) buckets.set(bk, {});
  buckets.get(bk)[String(p.id)] = detail;

  if (rv && Array.isArray(rv.items) && rv.items.length) {
    if (!rvBuckets.has(bk)) rvBuckets.set(bk, {});
    rvBuckets.get(bk)[String(p.id)] = {
      total: rv.total || rv.items.length,
      bars: rv.bars || null,
      source: rvSource,
      from: rv.from || '',
      items: rv.items.slice(0, 8),
    };
  }

  /* 类目归属：商品加入其分类路径上的**每一个**类目（含父级），按 slug 去重
     —— 这样点任何一级/二级类目都能看到自己（含子孙）的商品，而不是回退到全量列表 */
  {
    const seenSlug = new Set();
    for (const c of cats) {
      const cs = slugify(c.name);
      if (seenSlug.has(cs)) continue;
      seenSlug.add(cs);
      if (!catRows.has(cs)) catRows.set(cs, { name: c.name, rows: [] });
      catRows.get(cs).rows.push(row);
    }
    if (!seenSlug.has(leafSlug)) {
      if (!catRows.has(leafSlug)) catRows.set(leafSlug, { name: leafName, rows: [] });
      catRows.get(leafSlug).rows.push(row);
    }
  }

  // 首页候选池
  const dealPct2 = dealPct;
  if (dealPct2 >= 40) heroPool.flash.push({ row, dealPct: dealPct2 });
  heroPool.best.push({ row, rateTotal: rating.total || 0 });
  heroPool.top.push({ row, rate: (rating.avg || 0) * Math.log10((rating.total || 1) + 10) });

  processed++;
  if (processed % 5000 === 0) console.log('  parsed', processed);
}

console.log('valid', processed, 'dead', dead, 'categories', catTree.size, 'brands', brandMap.size);
console.log('reviews: own', revMap.size, '| series-matched', seriesMatched, '| brand-matched', brandMatched);

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
const MAX_ROWS = 5000;
for (const [slug, obj] of catRows) {
  fs.writeFileSync(path.join(DATA, 'cat', slug + '.json'), JSON.stringify({ slug, name: obj.name, rows: obj.rows.slice(0, MAX_ROWS) }));
}
console.log('cat files', catRows.size);

/* 每个类目都要有分片文件（没有商品的类目也写空数组，避免前端回退到全量列表） */
let emptyCatFiles = 0;
for (const c of cats) {
  const slug = slugify(c.name);
  const f = path.join(DATA, 'cat', slug + '.json');
  if (!fs.existsSync(f)) { fs.writeFileSync(f, JSON.stringify({ slug, name: c.name, rows: [] })); emptyCatFiles++; }
}
console.log('cat files ensured:', emptyCatFiles);

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

/* ---------- home.json：完全按源站首页区块（/mobile/v4/main/block + deal-products） ---------- */
function loadJsonOr(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fallback; }
}
const BLOCK = loadJsonOr(path.join(RAW, 'home-block-desktop.json'), { data: { blocks: [] } });
const DEALAPI = loadJsonOr(path.join(RAW, 'home-deals.json'), { data: { deal_products: [] } });
const blocks = (BLOCK.data && BLOCK.data.blocks) || [];
const blockOf = (type) => blocks.find((b) => b.type === type) || null;

/* 站内链接：源站 URL → 站内路径 */
function toInternal(url, id) {
  if (id) return '/product?id=' + id;
  return '/catalog';
}

/* 首页商品卡（价格统一走 6 折） */
function blockProduct(p) {
  const market = Number(p.market_price) || Number(p.price) || 0;
  const sale = salePrice(market);
  const id = Number(p.id) || 0;
  return {
    id,
    name: p.name || '',
    brandName: (p.brand && p.brand.name) || '',
    market_price: market,
    sale,
    img: p.image || '',
    cat: p.category_name || '',
    rate: (p.rating && p.rating.average) || 0,
    rateCount: (p.rating && p.rating.total) || 0,
    popular: p.bought_count || 0,
    dealPercent: (p.deal && p.deal.bought_percent) || 0,
    url: toInternal(p.product_url, id),
    sourceUrl: p.product_url || '',
  };
}

/* 源站链接 → 站内路径（快捷入口按各自类目落地） */
const catSlugSet = new Set(catOut.map((c) => c.slug));
const catNameMap = new Map(catOut.map((c) => [c.name, c.slug]));
function mapUrl(u, title) {
  const s = String(u || '');
  if (/\/hard\/all_cate/.test(s)) return '/catalog';
  if (/\/campaign\//.test(s)) return '/deals';
  if (/hang-moi-ve/.test(s)) return '/catalog?sort=new';
  if (/hotro\.hasaki\.vn/.test(s)) return '/policy?slug=support';
  if (/\/booking/.test(s)) return '/policy?slug=clinic';
  const m = s.match(/\/danh-muc\/(.+)-c\d+\.html/);
  if (m && catSlugSet.has(m[1])) return '/catalog?slug=' + encodeURIComponent(m[1]);
  if (title && catNameMap.has(title)) return '/catalog?slug=' + encodeURIComponent(catNameMap.get(title));
  if (m) {
    const kw = String(title || m[1].replace(/-/g, ' ')).split(/[&/|]/)[0].trim();
    return '/search?q=' + encodeURIComponent(kw);
  }
  return '/catalog';
}

const bannerBlock = blockOf('SlideBanner');
const shortcutBlock = blockOf('Shortcut');
const dealsBlock = blockOf('ProductHorizontalListScroll');
const topSearchBlock = blockOf('TopSearch');
const brandBlock = blockOf('BrandHorizontalListScroll');
const catBlock = blockOf('CategoryListScroll');

const home = {
  banners: ((bannerBlock && bannerBlock.data.banners) || []).map((b) => ({
    name: b.name || '', img: b.image || '', url: toInternal(b.url, 0),
  })),
  shortcuts: ((shortcutBlock && shortcutBlock.data.shortcuts) || []).map((s) => ({
    title: s.title || '', img: s.image || '', url: mapUrl(s.url, s.title),
  })),
  dealsTitle: (dealsBlock && dealsBlock.data.title) || 'DEALS ĐANG DIỄN RA',
  dealsUrl: '/deals',
  deals: ((dealsBlock && dealsBlock.data.products) || []).map(blockProduct),
  topSearchTitle: (topSearchBlock && topSearchBlock.data.title) || 'TÌM KIẾM NHIỀU NHẤT',
  topSearch: ((topSearchBlock && topSearchBlock.data.searches) || []).map((s) => ({
    title: s.title || '', sub: s.sub_title || '', url: '/search?q=' + encodeURIComponent(s.title || ''),
    images: (s.search_list || []).map((x) => x.image).filter(Boolean),
    urls: (s.search_list || []).map((x) => {
      const m = String(x.url || '').match(/-(\d+)\.html$/);
      return m ? '/product?id=' + m[1] : '/search?q=' + encodeURIComponent(s.title || '');
    }),
  })),
  brandsTitle: (brandBlock && brandBlock.data.title) || 'THƯƠNG HIỆU NỔI BẬT',
  brands: ((brandBlock && brandBlock.data.brands) || []).map((b) => ({
    name: b.name || '',
    img: b.image || b.cover_220 || b.cover_170 || b.image_150_75 || '',
    url: '/search?q=' + encodeURIComponent(b.name || ''),
  })),
  catsTitle: (catBlock && catBlock.data.title) || 'DANH MỤC NGÀNH HÀNG',
  cats: ((catBlock && catBlock.data.categories) || []).map((c) => {
    /* 用源站类目名对齐到我们的 slug（名字完全一致才用，否则按名字 slugify） */
    const hit = catOut.find((x) => x.name === c.name);
    const slug = hit ? hit.slug : slugify(c.name);
    return { name: c.name || '', img: c.image || '', url: '/catalog?slug=' + encodeURIComponent(slug) };
  }),
  flashTitle: 'DEAL ĐỈNH',
  flashUrl: '/deals',
  flash: ((DEALAPI.data && DEALAPI.data.deal_products) || []).map(blockProduct),
  stats: { products: indexRows.length, categories: cats.length, brands: brandMap.size },
};

/* 兜底：区块抓不到时用本地数据（保证页面不空） */
if (!home.banners.length) {
  home.banners = BANNERS.hero.map((u, i) => ({ name: 'Banner ' + (i + 1), img: u, url: '/deals' }));
}
if (!home.deals.length) home.deals = pickRows(heroPool.flash, 10, 'dealPct').map(toProd);
if (!home.cats.length) home.cats = tileCats.map((c) => ({ name: c.name, img: c.img, url: '/catalog?slug=' + c.slug }));
if (!home.brands.length) home.brands = brandsTop.map((b) => ({ name: b.name, img: b.image, url: '/search?q=' + encodeURIComponent(b.name) }));
if (!home.flash.length) home.flash = pickRows(heroPool.flash, 6, 'dealPct').map(toProd);

fs.writeFileSync(path.join(DATA, 'home.json'), JSON.stringify(home));
console.log('home.json ok | banners', home.banners.length, '| shortcuts', home.shortcuts.length,
  '| deals', home.deals.length, '| topSearch', home.topSearch.length, '| brands', home.brands.length,
  '| cats', home.cats.length, '| flash', home.flash.length);
fs.writeFileSync(path.join(DATA, 'home.json'), JSON.stringify(home));
console.log('home.json ok; stats', JSON.stringify(home.stats));
