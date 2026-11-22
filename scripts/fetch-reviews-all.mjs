/**
 * 全站评论补抓：对 raw/inventory.json 里每个商品抓 /mobile/v1/detail/product/comments?page=1
 * 已存在（且非空）的跳过，可断点续跑。
 */
import fs from 'node:fs';
import path from 'node:path';
import { curlBatch, sleep } from './fetch-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const REV = path.join(RAW, 'reviews');
const DET = path.join(RAW, 'detail');
fs.mkdirSync(REV, { recursive: true });

const BATCH = Number(process.env.BATCH || 500);
const CONC = Number(process.env.CONC || 12);

const inventory = JSON.parse(fs.readFileSync(path.join(RAW, 'inventory.json'), 'utf8'));
console.log('inventory', inventory.length);

const strip = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : s || '');

function slimReviews(raw) {
  let j;
  try { j = JSON.parse(raw); } catch (e) { return { total: 0, items: [] }; }
  const d = j && j.data;
  if (!d || !Array.isArray(d.comments)) return { total: 0, items: [] };
  return {
    total: (d.meta_data && d.meta_data.comments_total) || d.comments.length,
    items: d.comments.slice(0, 8).map((c) => ({
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

/* 待抓：没有评论文件，或文件里是空评论且详情给了评分线索 */
const todo = [];
for (const t of inventory) {
  const rf = path.join(REV, t.id + '.json');
  if (!fs.existsSync(rf)) { todo.push(t); continue; }
  try {
    const j = JSON.parse(fs.readFileSync(rf, 'utf8'));
    if (!j.items || !j.items.length) todo.push(t);
  } catch (e) { todo.push(t); }
}
console.log('reviews todo', todo.length);

const t0 = Date.now();
let done = 0, withComments = 0, empty = 0;
for (let i = 0; i < todo.length; i += BATCH) {
  const chunk = todo.slice(i, i + BATCH);
  const jobs = chunk.map((t) => ({
    url: `https://hasaki.vn/mobile/v1/detail/product/comments?product_id=${t.id}&page=1`,
    out: `reviews/${t.id}.raw.json`,
  }));
  let r;
  try {
    r = curlBatch(jobs, { concurrency: CONC, cwd: RAW, timeout: 45 });
  } catch (e) {
    console.log('batch error', e.message);
    await sleep(3000);
    continue;
  }
  for (const f of r.ok) {
    const id = path.basename(f, '.raw.json');
    try {
      const slim = slimReviews(fs.readFileSync(f, 'utf8'));
      if (slim.items.length) withComments++; else empty++;
      fs.writeFileSync(path.join(REV, id + '.json'), JSON.stringify(slim));
    } catch (e) {
      fs.writeFileSync(path.join(REV, id + '.json'), JSON.stringify({ total: 0, items: [] }));
    }
    fs.rmSync(f, { force: true });
  }
  for (const f of r.fail) {
    const id = path.basename(f.out, '.raw.json');
    const p = path.join(REV, id + '.json');
    if (!fs.existsSync(p)) fs.writeFileSync(p, JSON.stringify({ total: 0, items: [], status: f.status }));
  }
  done += chunk.length;
  const el = (Date.now() - t0) / 1000;
  const rate = done / Math.max(el, 1);
  console.log(`[reviews] ${done}/${todo.length}  ${rate.toFixed(1)}/s  eta ${Math.round((todo.length - done) / Math.max(rate, 0.01) / 60)}min  withComments=${withComments} empty=${empty}`);
  await sleep(120);
}
console.log('DONE reviews in', Math.round((Date.now() - t0) / 1000), 's | withComments', withComments, 'empty', empty);
