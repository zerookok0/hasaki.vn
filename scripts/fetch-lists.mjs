/**
 * 抓源站的「新品」「热卖」列表（分页），生成独立的类目分片：
 *   data/cat/new-arrivals.json  ← /mobile/v3/main/products/new-products（Mới nhất）
 *   data/cat/best-sellers.json  ← /mobile/v3/main/products/top-sales（Bán chạy）
 *   data/cat/deals.json         ← 索引里带 deal 进度的商品（DEAL 页）
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const DATA = path.join(ROOT, 'data');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGES = Number(process.env.PAGES || 6);
const DISCOUNT = 0.6;

const salePrice = (m) => (Number(m) > 0 ? Math.round((Number(m) * DISCOUNT) / 100) * 100 : 0);

function get(p) {
  const out = execFileSync('curl.exe', ['-s', '--max-time', '45', '-x', 'http://127.0.0.1:7890', '-A', UA,
    '-H', 'Accept: application/json', '-w', '\n__S:%{http_code}', 'https://hasaki.vn' + p]).toString('utf8');
  const i = out.lastIndexOf('\n__S:');
  return { status: Number(out.slice(i + 5)), body: out.slice(0, i) };
}

function toRow(p) {
  const market = Number(p.market_price) || Number(p.price) || 0;
  if (!market) return null;
  return [
    Number(p.id) || 0,
    p.name || '',
    (p.brand && p.brand.name) || '',
    market,
    salePrice(market),
    p.image || '',
    p.category_name || '',
    (p.rating && p.rating.average) || 0,
    (p.rating && p.rating.total) || 0,
    p.bought_count || 0,
    (p.deal && p.deal.bought_percent) || 0,
  ];
}

function collect(apiPath, name, title) {
  const rows = [];
  const seen = new Set();
  for (let page = 1; page <= PAGES; page++) {
    const r = get(`${apiPath}?page=${page}`);
    if (r.status !== 200) { console.log('  page', page, 'status', r.status); break; }
    let j;
    try { j = JSON.parse(r.body); } catch (e) { break; }
    const products = (j.data && j.data.products) || [];
    if (!products.length) break;
    let added = 0;
    for (const p of products) {
      const row = toRow(p);
      if (!row || seen.has(row[0])) continue;
      seen.add(row[0]);
      rows.push(row);
      added++;
    }
    console.log(`  ${name} page ${page}: +${added} (total ${rows.length})`);
    if (added === 0) break;
  }
  fs.writeFileSync(path.join(DATA, 'cat', name + '.json'), JSON.stringify({ slug: name, name: title, rows }));
  console.log(`${name}.json -> ${rows.length} rows`);
  return rows;
}

const newRows = collect('/mobile/v3/main/products/new-products', 'new-arrivals', 'Hàng Mới Về');
const bestRows = collect('/mobile/v3/main/products/top-sales', 'best-sellers', 'Bán Chạy');

/* DEAL 页：索引里 deal 进度 > 0 的商品 */
const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const dealRows = (idx.rows || []).filter((r) => (r[10] || 0) > 0).sort((a, b) => (b[10] || 0) - (a[10] || 0)).slice(0, 3000);
fs.writeFileSync(path.join(DATA, 'cat', 'deals.json'), JSON.stringify({ slug: 'deals', name: 'Deals', rows: dealRows }));
console.log('deals.json ->', dealRows.length, 'rows');

console.log('\nsummary: new', newRows.length, '| best', bestRows.length, '| deals', dealRows.length);
const overlap = newRows.filter((r) => bestRows.some((b) => b[0] === r[0])).map((r) => r[0]);
console.log('new ∩ best overlap:', overlap.length, overlap.slice(0, 10));
