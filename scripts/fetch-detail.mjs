/**
 * 抓商品详情 + 首屏评论。
 * 输入 raw/inventory.json（id, slug, url）
 * 输出 raw/detail/<id>.json（精简后的商品对象）、raw/reviews/<id>.json
 * 断点续跑：已存在且 size>200 的跳过。
 */
import fs from 'node:fs';
import path from 'node:path';
import { curlBatch, sleep } from './fetch-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const DET = path.join(RAW, 'detail');
const REV = path.join(RAW, 'reviews');
fs.mkdirSync(DET, { recursive: true });
fs.mkdirSync(REV, { recursive: true });

const args = process.argv.slice(2);
const opt = (k, d) => {
  const i = args.indexOf('--' + k);
  return i >= 0 ? args[i + 1] : d;
};
const LIMIT = Number(opt('limit', 0));
const CONC = Number(opt('conc', 8));
const BATCH = Number(opt('batch', 400));
const ONLY = opt('only', ''); // 'detail' | 'reviews' | ''

const inventory = JSON.parse(fs.readFileSync(path.join(RAW, 'inventory.json'), 'utf8'));
const targets = LIMIT ? inventory.slice(0, LIMIT) : inventory;
console.log('inventory', inventory.length, 'targets', targets.length);

function need(id, kind) {
  const f = path.join(kind === 'detail' ? DET : REV, id + '.json');
  return !fs.existsSync(f) || fs.statSync(f).size < 40;
}

const strip = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s || '');

function slimDetail(raw) {
  const j = JSON.parse(raw);
  if (!j || !j.data || !Array.isArray(j.data.blocks)) return null;
  const ci = j.data.blocks.find((b) => b.type === 'CommonInfo');
  if (!ci || !ci.common_data) return null;
  const c = ci.common_data;
  const blk = (t) => j.data.blocks.find((x) => x.type === t);

  /* 描述 / 规格 / 成分 / 用法：真实结构在 *_data 里（不是 common_data） */
  const descB = blk('DescriptionInfo');
  const specB = blk('SpecificationInfo');
  const ingrB = blk('IngredientInfo');
  const guideB = blk('GuideInfo');
  const rateB = blk('ShortRatingInfo');

  const infoOf = (b, key) => {
    if (!b) return null;
    const d = b[key] || b.common_data || b.data;
    if (!d) return null;
    return d.info || d;
  };

  const descInfo = descB ? (descB.description_data && descB.description_data.info) || null : null;
  const specList = specB && specB.specification_data && Array.isArray(specB.specification_data.infos)
    ? specB.specification_data.infos : [];
  const ingrInfo = ingrB ? (ingrB.ingredient_data && ingrB.ingredient_data.info) || null : null;
  const guideInfo = guideB ? (guideB.guide_data && guideB.guide_data.info) || null : null;
  const rateInfo = rateB ? (rateB.short_rating_data || null) : null;

  const descHtml = (descInfo && (descInfo.full || descInfo.short)) || '';
  const ingrHtml = (ingrInfo && (ingrInfo.full || ingrInfo.short)) || '';
  const guideHtml = (guideInfo && (guideInfo.full || guideInfo.short)) || '';

  const reviews = rateInfo && Array.isArray(rateInfo.image_reviews)
    ? rateInfo.image_reviews.slice(0, 6).map((r) => ({
        content: strip(r.content).slice(0, 600),
        user: r.user_fullname || '',
        star: (r.rating && r.rating.star) || 5,
        at: r.created_at || 0,
        reply: strip(r.answer_rating || '').slice(0, 400),
        imgs: (r.images || []).slice(0, 3).map((x) => (typeof x === 'string' ? x : x.image || x.url || '')).filter(Boolean),
      }))
    : [];

  const out = {
    id: c.id,
    sku: c.sku,
    name: c.name,
    en: c.english_name || '',
    cat_name: c.category_name || '',
    url: c.url,
    brand: c.brand ? { id: c.brand.id, name: c.brand.name, image: c.brand.image || '' } : null,
    market_price: c.market_price || 0,
    price: c.price || 0,
    discount_percent: c.discount_percent || 0,
    promo: strip(c.promotion_text),
    promos: Array.isArray(c.multi_promotion_text) ? c.multi_promotion_text.filter(Boolean).map(strip) : [],
    badge: c.promotion_badge || null,
    quantity: c.quantity || 0,
    bought_count: c.bought_count || 0,
    deal: c.deal
      ? { percent: c.deal.bought_percent || 0, qty: c.deal.quantity || 0, expired: c.deal.expired || 0, remain: c.deal.time_remain || 0 }
      : null,
    rating: c.rating ? { avg: c.rating.average || 0, total: c.rating.total || 0 } : null,
    rating_short: rateInfo && rateInfo.info ? { avg: rateInfo.info.average || 0, total: rateInfo.info.total || 0 } : null,
    comment_total: c.comment && c.comment.total ? c.comment.total : 0,
    now_free: !!c.now_free,
    out_of_stock: !!c.icon_out_stock,
    announce: c.announce && c.announce.number ? strip(c.announce.number) : '',
    gallery: Array.isArray(c.gallery) ? c.gallery.map((g) => g.image).filter(Boolean) : [],
    cats: Array.isArray(c.category_list)
      ? c.category_list.map((x) => ({ id: x.id || x.category_id || 0, name: x.name || x.category_name || '' }))
      : [],
    price_detail: c.price_detail
      ? { market: c.price_detail.market_price || '', final_price: c.price_detail.final_price || '' }
      : null,
    desc: descHtml.slice(0, 120000),
    spec: specList.filter((r) => r && r.label).map((r) => [strip(r.label), strip(String(r.value == null ? '' : r.value))]).slice(0, 40),
    ingr: ingrHtml.slice(0, 40000),
    guide: guideHtml.slice(0, 20000),
    reviews,
  };
  return out;
}

function flattenSpec(b) {
  const rows = [];
  const walk = (v, depth = 0) => {
    if (!v || depth > 4) return;
    if (Array.isArray(v)) return v.forEach((x) => walk(x, depth + 1));
    if (typeof v === 'object') {
      if (v.label && (v.value !== undefined && v.value !== null && typeof v.value !== 'object')) {
        rows.push([strip(v.label), strip(String(v.value))]);
      }
      for (const k of Object.keys(v)) walk(v[k], depth + 1);
    }
  };
  walk(b);
  return rows.slice(0, 40);
}

function slimReviews(raw) {
  const j = JSON.parse(raw);
  const d = j && j.data;
  if (!d || !Array.isArray(d.comments)) return null;
  return {
    total: (d.meta_data && d.meta_data.comments_total) || d.comments.length,
    items: d.comments.slice(0, 6).map((c) => ({
      id: c.id,
      content: strip(c.content).slice(0, 600),
      like: c.like_count || 0,
      at: c.created_at || 0,
      user: c.user ? c.user.fullname : '',
      root: c.user ? !!c.user.is_root : false,
      replies: Array.isArray(c.sub_comments)
        ? c.sub_comments.slice(0, 2).map((s) => ({ content: strip(s.content).slice(0, 400), user: s.user ? s.user.fullname : '' }))
        : [],
    })),
  };
}

const t0 = Date.now();
let done = 0;
const todo = ONLY === 'reviews'
  ? []
  : targets.filter((t) => need(t.id, 'detail'));
console.log('detail todo', todo.length);

for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH);
  const jobs = chunk.map((t) => ({ url: `https://hasaki.vn/mobile/v3/detail/product?product_id=${t.id}&full=1`, out: `detail/${t.id}.raw.json`, id: t.id }));
  const r = curlBatch(jobs, { concurrency: CONC, cwd: RAW, timeout: 45 });
  // 清洗落盘
  for (const f of r.ok) {
    const id = path.basename(f, '.raw.json');
    try {
      const slim = slimDetail(fs.readFileSync(f, 'utf8'));
      if (slim) fs.writeFileSync(path.join(DET, id + '.json'), JSON.stringify(slim));
    } catch (e) { /* ignore */ }
    fs.rmSync(f, { force: true });
  }
  for (const f of r.fail) {
    const id = path.basename(f.out, '.raw.json');
    fs.writeFileSync(path.join(DET, id + '.json'), JSON.stringify({ id: Number(id), dead: true, status: f.status }));
  }
  done += chunk.length;
  const el = (Date.now() - t0) / 1000;
  const rate = done / Math.max(el, 1);
  const left = Math.round((todo.length - done) / Math.max(rate, 0.01));
  console.log(`[detail] ${done}/${todo.length} ok+dead  ${rate.toFixed(1)}/s  eta ${Math.round(left / 60)}min  fail=${r.fail.length}`);
  await sleep(150);
}

// 评论
// 评论：只对「有评分/有评论」的商品抓（详情里已带 rating 与首屏 image_reviews 兜底）
const revTodo = ONLY === 'detail' ? [] : targets.filter((t) => {
  if (!need(t.id, 'reviews')) return false;
  try {
    const d = JSON.parse(fs.readFileSync(path.join(DET, t.id + '.json'), 'utf8'));
    if (d.dead) return false;
    const rt = (d.rating && d.rating.total) || (d.rating_short && d.rating_short.total) || 0;
    const ct = d.comment_total || 0;
    return rt > 0 || ct > 0 || (d.reviews && d.reviews.length > 0);
  } catch (e) { return false; }
});
console.log('reviews todo', revTodo.length);
for (let i = 0; i < revTodo.length; i += BATCH) {
  const chunk = revTodo.slice(i, i + BATCH);
  const jobs = chunk.map((t) => ({ url: `https://hasaki.vn/mobile/v1/detail/product/comments?product_id=${t.id}&page=1`, out: `reviews/${t.id}.raw.json`, id: t.id }));
  const r = curlBatch(jobs, { concurrency: CONC, cwd: RAW, timeout: 45 });
  for (const f of r.ok) {
    const id = path.basename(f, '.raw.json');
    try {
      const slim = slimReviews(fs.readFileSync(f, 'utf8'));
      fs.writeFileSync(path.join(REV, id + '.json'), JSON.stringify(slim || { total: 0, items: [] }));
    } catch (e) { fs.writeFileSync(path.join(REV, id + '.json'), JSON.stringify({ total: 0, items: [] })); }
    fs.rmSync(f, { force: true });
  }
  for (const f of r.fail) {
    const id = path.basename(f.out, '.raw.json');
    fs.writeFileSync(path.join(REV, id + '.json'), JSON.stringify({ total: 0, items: [], status: f.status }));
  }
  const el = (Date.now() - t0) / 1000;
  console.log(`[reviews] ${Math.min(i + BATCH, revTodo.length)}/${revTodo.length}  ${(i + BATCH) / el}*/s  keepalive`);
  await sleep(150);
}

console.log('DONE detail+reviews in', Math.round((Date.now() - t0) / 1000), 's');
