/**
 * 补抓首页区块里引用、但不在商品清单里的 SKU 详情（DEALS / 热搜词里的商品）。
 * 抓完写 raw/detail/<id>.json，之后跑 scripts/parse.mjs 并入数据。
 */
import fs from 'node:fs';
import path from 'node:path';
import { curlBatch, sleep } from './fetch-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const DATA = path.join(ROOT, 'data');
const DET = path.join(RAW, 'detail');
fs.mkdirSync(DET, { recursive: true });

const strip = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s || '');

function bucketHas(id) {
  const f = path.join(DATA, 'p', Math.floor(Number(id) / 500) + '.json');
  if (!fs.existsSync(f)) return false;
  try { return !!JSON.parse(fs.readFileSync(f, 'utf8'))[String(id)]; } catch (e) { return false; }
}

/* 收集需要补的 id */
const home = JSON.parse(fs.readFileSync(path.join(DATA, 'home.json'), 'utf8'));
const ids = new Set();
for (const g of ['flash', 'deals']) for (const p of home[g] || []) if (p && p.id) ids.add(Number(p.id));
for (const s of home.topSearch || []) {
  for (const u of s.urls || []) {
    const m = String(u).match(/id=(\d+)/);
    if (m) ids.add(Number(m[1]));
  }
}
const need = [...ids].filter((id) => !bucketHas(id) && !fs.existsSync(path.join(DET, id + '.json')));
console.log('referenced ids:', ids.size, '| need fetch:', need.length, need);
if (!need.length) process.exit(0);

/* ---------- 精简（与 fetch-detail.mjs 同口径） ---------- */
function slimDetail(raw) {
  const j = JSON.parse(raw);
  if (!j || !j.data || !Array.isArray(j.data.blocks)) return null;
  const ci = j.data.blocks.find((b) => b.type === 'CommonInfo');
  if (!ci || !ci.common_data) return null;
  const c = ci.common_data;
  const blk = (t) => j.data.blocks.find((x) => x.type === t);
  const descB = blk('DescriptionInfo'), specB = blk('SpecificationInfo');
  const ingrB = blk('IngredientInfo'), guideB = blk('GuideInfo'), rateB = blk('ShortRatingInfo');
  const descInfo = descB && descB.description_data ? descB.description_data.info : null;
  const specList = specB && specB.specification_data && Array.isArray(specB.specification_data.infos) ? specB.specification_data.infos : [];
  const ingrInfo = ingrB && ingrB.ingredient_data ? ingrB.ingredient_data.info : null;
  const guideInfo = guideB && guideB.guide_data ? guideB.guide_data.info : null;
  const rateInfo = rateB ? rateB.short_rating_data : null;
  const reviews = rateInfo && Array.isArray(rateInfo.image_reviews)
    ? rateInfo.image_reviews.slice(0, 6).map((r) => ({
        content: strip(r.content).slice(0, 600), user: r.user_fullname || '',
        star: (r.rating && r.rating.star) || 5, at: r.created_at || 0,
        reply: strip(r.answer_rating || '').slice(0, 400),
        imgs: (r.images || []).slice(0, 3).map((x) => (typeof x === 'string' ? x : x.image || x.url || '')).filter(Boolean),
      }))
    : [];
  return {
    id: c.id, sku: c.sku, name: c.name, en: c.english_name || '', cat_name: c.category_name || '',
    url: c.url,
    brand: c.brand ? { id: c.brand.id, name: c.brand.name, image: c.brand.image || '' } : null,
    market_price: c.market_price || 0, price: c.price || 0, discount_percent: c.discount_percent || 0,
    promo: strip(c.promotion_text),
    promos: Array.isArray(c.multi_promotion_text) ? c.multi_promotion_text.filter(Boolean).map(strip) : [],
    badge: c.promotion_badge || null,
    quantity: c.quantity || 0, bought_count: c.bought_count || 0,
    deal: c.deal ? { percent: c.deal.bought_percent || 0, qty: c.deal.quantity || 0, expired: c.deal.expired || 0, remain: c.deal.time_remain || 0 } : null,
    rating: c.rating ? { avg: c.rating.average || 0, total: c.rating.total || 0 } : null,
    rating_short: rateInfo && rateInfo.info ? { avg: rateInfo.info.average || 0, total: rateInfo.info.total || 0 } : null,
    comment_total: c.comment && c.comment.total ? c.comment.total : 0,
    now_free: !!c.now_free, out_of_stock: !!c.icon_out_stock,
    announce: c.announce && c.announce.number ? strip(c.announce.number) : '',
    gallery: Array.isArray(c.gallery) ? c.gallery.map((g) => g.image).filter(Boolean) : [],
    cats: Array.isArray(c.category_list) ? c.category_list.map((x) => ({ id: x.id || x.category_id || 0, name: x.name || x.category_name || '' })) : [],
    price_detail: c.price_detail ? { market: c.price_detail.market_price || '', final_price: c.price_detail.final_price || '' } : null,
    desc: (descInfo && (descInfo.full || descInfo.short) || '').slice(0, 120000),
    spec: specList.filter((r) => r && r.label).map((r) => [strip(r.label), strip(String(r.value == null ? '' : r.value))]).slice(0, 40),
    ingr: (ingrInfo && (ingrInfo.full || ingrInfo.short) || '').slice(0, 40000),
    guide: (guideInfo && (guideInfo.full || guideInfo.short) || '').slice(0, 20000),
    reviews,
  };
}

/* ---------- 抓取 ---------- */
const BATCH = 10;
let ok = 0, fail = 0;
for (let i = 0; i < need.length; i += BATCH) {
  const chunk = need.slice(i, i + BATCH);
  const jobs = chunk.map((id) => ({ url: `https://hasaki.vn/mobile/v3/detail/product?product_id=${id}&full=1`, out: `detail/${id}.raw.json` }));
  const r = curlBatch(jobs, { concurrency: 6, cwd: RAW, timeout: 45 });
  for (const f of r.ok) {
    const id = path.basename(f, '.raw.json');
    try {
      const slim = slimDetail(fs.readFileSync(f, 'utf8'));
      if (slim) { fs.writeFileSync(path.join(DET, id + '.json'), JSON.stringify(slim)); ok++; }
      else { fail++; }
    } catch (e) { fail++; }
    fs.rmSync(f, { force: true });
  }
  for (const f of r.fail) {
    console.log('  fail', f.out, f.status);
    fail++;
    const id = path.basename(f.out, '.raw.json');
    fs.writeFileSync(path.join(DET, id + '.json'), JSON.stringify({ id: Number(id), dead: true, status: f.status }));
  }
  await sleep(200);
}
console.log('fetched ok:', ok, 'fail:', fail);
console.log('now run: node scripts/parse.mjs');
