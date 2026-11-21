/**
 * 抓全量商品清单 + 分类树。
 * 输出：raw/sitemap/*.xml、raw/inventory.json、raw/categories.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { curlGet, curlBatch, sleep } from './fetch-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const SM = path.join(RAW, 'sitemap');
fs.mkdirSync(SM, { recursive: true });

const BASE = 'https://hasaki.vn';

const idxRes = curlGet(BASE + '/sitemap.xml');
if (idxRes.status !== 200) throw new Error('sitemap index -> ' + idxRes.status);
fs.writeFileSync(path.join(SM, 'index.xml'), idxRes.body);
const files = [...idxRes.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log('sitemap files:', files.length);

// 批量下载所有子 sitemap（用纯 ASCII 相对文件名，避免 curl 解析中文路径）
const jobs = files
  .map((f) => ({ url: f, out: f.split('/').pop() }))
  .filter((j) => !fs.existsSync(path.join(SM, j.out)) || fs.statSync(path.join(SM, j.out)).size < 200);
if (jobs.length) {
  const r = curlBatch(jobs, { concurrency: 6, cwd: SM });
  console.log('sitemap downloaded ok:', r.ok.length, 'fail:', r.fail.length);
  for (const f of r.fail.slice(0, 5)) console.log('  fail', f.out, f.status);
}

const byId = new Map();
function addUrl(u) {
  const m = u.match(/\/san-pham\/([a-z0-9\-]+)-(\d+)\.html$/i);
  if (!m) return false;
  const id = Number(m[2]);
  if (!id) return false;
  if (!byId.has(id)) byId.set(id, { id, slug: m[1], url: u });
  return true;
}
for (const f of files) {
  const file = path.join(SM, f.split('/').pop());
  if (!fs.existsSync(file)) { console.log('missing', file); continue; }
  const xml = fs.readFileSync(file, 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  for (const l of locs) addUrl(l);
}
const inventory = [...byId.values()].sort((a, b) => a.id - b.id);

// 分类树
const cats = [];
try {
  const r = curlGet(BASE + '/api/v4/main/category-left');
  const j = JSON.parse(r.body);
  for (const c of j.data.categoryLeft.subCate) {
    const mm = c.url.match(/danh-muc\/(.+)-c(\d+)\.html/);
    cats.push({ id: c.id, name: c.name, url: c.url, slug: mm ? mm[1] : String(c.id), level: 1 });
  }
} catch (e) { console.log('category-left failed', e.message); }

const catFile = path.join(SM, 'categories.xml');
if (fs.existsSync(catFile)) {
  const xml = fs.readFileSync(catFile, 'utf8');
  for (const m of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const mm = m[1].match(/\/danh-muc\/(.+)-c(\d+)\.html$/);
    if (!mm) continue;
    const id = Number(mm[2]);
    if (!cats.find((c) => c.id === id)) cats.push({ id, name: mm[1].replace(/-/g, ' '), url: m[1], slug: mm[1], level: 2 });
  }
}

fs.writeFileSync(path.join(RAW, 'inventory.json'), JSON.stringify(inventory));
fs.writeFileSync(path.join(RAW, 'categories.json'), JSON.stringify(cats, null, 1));
console.log('TOTAL products:', inventory.length);
console.log('TOTAL categories:', cats.length);
