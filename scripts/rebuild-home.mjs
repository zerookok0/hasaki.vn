/** 只重建 data/home.json（首页区块），避免为了首页数据重跑 20 分钟的完整 parse */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const DATA = path.join(ROOT, 'data');
const DISCOUNT = 0.6;

function slugify(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70) || 'khac';
}
const salePrice = (m) => (Number(m) > 0 ? Math.round((Number(m) * DISCOUNT) / 100) * 100 : 0);
const load = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return fb; } };

const cats = load(path.join(DATA, 'categories.json'), []);
const catSlugs = new Set(cats.map((c) => c.slug));
const catByName = new Map(cats.map((c) => [c.name, c.slug]));

/* 源站链接 → 站内路径（快捷入口按各自类目落地，不再全部指向 /catalog） */
function mapUrl(u, title) {
  const s = String(u || '');
  if (/\/hard\/all_cate/.test(s)) return '/catalog';
  if (/\/campaign\//.test(s)) return '/deals';
  if (/hang-moi-ve/.test(s)) return '/catalog?sort=new';
  if (/hotro\.hasaki\.vn/.test(s)) return '/policy?slug=support';
  if (/\/booking/.test(s)) return '/policy?slug=clinic';
  const m = s.match(/\/danh-muc\/(.+)-c\d+\.html/);
  if (m && catSlugs.has(m[1])) return '/catalog?slug=' + encodeURIComponent(m[1]);
  /* 源站 slug 与我们的类目名不一致时，按标题对齐 */
  if (title && catByName.has(title)) return '/catalog?slug=' + encodeURIComponent(catByName.get(title));
  if (m) {
    /* 类目缺失时用标题首词搜索（"Balo & Túi Xách" → "Balo"），保证点进去有结果 */
    const kw = String(title || m[1].replace(/-/g, ' ')).split(/[&/|]/)[0].trim();
    return '/search?q=' + encodeURIComponent(kw);
  }
  return '/catalog';
}
const BLOCK = load(path.join(RAW, 'home-block-desktop.json'), { data: { blocks: [] } });
const DEALAPI = load(path.join(RAW, 'home-deals.json'), { data: { deal_products: [] } });
const blocks = (BLOCK.data && BLOCK.data.blocks) || [];
const blockOf = (t) => blocks.find((b) => b.type === t) || null;

function blockProduct(p) {
  const market = Number(p.market_price) || Number(p.price) || 0;
  const id = Number(p.id) || 0;
  return {
    id, name: p.name || '', brandName: (p.brand && p.brand.name) || '',
    market_price: market, sale: salePrice(market), img: p.image || '',
    cat: p.category_name || '',
    rate: (p.rating && p.rating.average) || 0,
    rateCount: (p.rating && p.rating.total) || 0,
    popular: p.bought_count || 0,
    dealPercent: (p.deal && p.deal.bought_percent) || 0,
    url: '/product?id=' + id,
    sourceUrl: p.product_url || '',
  };
}

const bannerB = blockOf('SlideBanner');
const shortcutB = blockOf('Shortcut');
const dealsB = blockOf('ProductHorizontalListScroll');
const topB = blockOf('TopSearch');
const brandB = blockOf('BrandHorizontalListScroll');
const catB = blockOf('CategoryListScroll');

const home = {
  banners: ((bannerB && bannerB.data.banners) || []).map((b) => ({ name: b.name || '', img: b.image || '', url: '/deals' })),
  shortcuts: ((shortcutB && shortcutB.data.shortcuts) || []).map((s) => ({ title: s.title || '', img: s.image || '', url: mapUrl(s.url, s.title) })),
  dealsTitle: (dealsB && dealsB.data.title) || 'DEALS ĐANG DIỄN RA',
  dealsUrl: '/deals',
  deals: ((dealsB && dealsB.data.products) || []).map(blockProduct),
  topSearchTitle: (topB && topB.data.title) || 'TÌM KIẾM NHIỀU NHẤT',
  topSearch: ((topB && topB.data.searches) || []).map((s) => ({
    title: s.title || '', sub: s.sub_title || '',
    url: '/search?q=' + encodeURIComponent(s.title || ''),
    images: (s.search_list || []).map((x) => x.image).filter(Boolean),
    urls: (s.search_list || []).map((x) => {
      const m = String(x.url || '').match(/-(\d+)\.html$/);
      return m ? '/product?id=' + m[1] : '/search?q=' + encodeURIComponent(s.title || '');
    }),
  })),
  brandsTitle: (brandB && brandB.data.title) || 'THƯƠNG HIỆU NỔI BẬT',
  brands: ((brandB && brandB.data.brands) || []).map((b) => ({
    name: b.name || '',
    /* 用原图（500×500）而不是 150×75 的缩略图，避免放大后糊 */
    img: b.image || b.cover_220 || b.cover_170 || b.image_150_75 || '',
    url: '/search?q=' + encodeURIComponent(b.name || ''),
  })),
  catsTitle: (catB && catB.data.title) || 'DANH MỤC NGÀNH HÀNG',
  cats: ((catB && catB.data.categories) || []).map((c) => {
    const hit = cats.find((x) => x.name === c.name);
    return { name: c.name || '', img: c.image || '', url: '/catalog?slug=' + encodeURIComponent(hit ? hit.slug : slugify(c.name)) };
  }),
  flashTitle: 'DEAL ĐỈNH',
  flashUrl: '/deals',
  flash: ((DEALAPI.data && DEALAPI.data.deal_products) || []).map(blockProduct),
};

/* flash 兜底：deal-products 为空时，用索引里 deal 进度最高的商品 */
if (!home.flash.length) {
  const idx = load(path.join(DATA, 'index.json'), { rows: [] });
  home.flash = (idx.rows || [])
    .filter((r) => (r[10] || 0) > 0)
    .sort((a, b) => (b[10] || 0) - (a[10] || 0))
    .slice(0, 6)
    .map((r) => ({
      id: r[0], name: r[1], brandName: r[2], market_price: r[3], sale: r[4], img: r[5],
      cat: r[6], rate: r[7], rateCount: r[8], popular: r[9], dealPercent: r[10] || 0, url: '/product?id=' + r[0],
    }));
}
/* 其余区块兜底 */
if (!home.banners.length) home.banners = [{ name: 'Deals', img: '', url: '/deals' }];
if (!home.deals.length) home.deals = home.flash.slice(0, 8);

fs.writeFileSync(path.join(DATA, 'home.json'), JSON.stringify(home));
console.log('home.json rebuilt | banners', home.banners.length, '| shortcuts', home.shortcuts.length,
  '| deals', home.deals.length, '| topSearch', home.topSearch.length,
  '| brands', home.brands.length, '| cats', home.cats.length, '| flash', home.flash.length);
console.log('cats urls:', home.cats.map((c) => c.url).join(' '));
