/**
 * 抓源站首页 / 分类页的真实区块数据（与源站 1:1）
 *  - /mobile/v4/main/block       首页 6 个区块（轮播、快捷入口、deals、热搜、品牌、类目）
 *  - /mobile/v3/main/deal-products  Flash deals
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function get(p) {
  const out = execFileSync('curl.exe', ['-s', '--max-time', '45', '-x', 'http://127.0.0.1:7890', '-A', UA,
    '-H', 'Accept: application/json', '-w', '\n__S:%{http_code}', 'https://hasaki.vn' + p]).toString('utf8');
  const i = out.lastIndexOf('\n__S:');
  return { status: Number(out.slice(i + 5)), body: out.slice(0, i) };
}

const jobs = [
  ['/mobile/v4/main/block', 'home-block.json'],
  ['/mobile/v3/main/deal-products', 'home-deals.json'],
  ['/mobile/v3/main/products/top-sales?limit=12', 'home-topsales.json'],
];
for (const [p, f] of jobs) {
  const r = get(p);
  console.log(p, '->', r.status, r.body.length);
  if (r.status === 200 && r.body.trim().startsWith('{')) {
    try { fs.writeFileSync(path.join(RAW, f), JSON.stringify(JSON.parse(r.body))); } catch (e) { console.log('  json err'); }
  }
}

/* 输出 block 摘要，便于确认字段 */
const b = JSON.parse(fs.readFileSync(path.join(RAW, 'home-block.json'), 'utf8'));
for (const blk of b.data.blocks) {
  const d = blk.data || {};
  const arrKey = Object.keys(d).find((k) => Array.isArray(d[k]));
  console.log(`  ${blk.type}: title=${d.title || ''} count=${arrKey ? d[arrKey].length : 0} key=${arrKey || '-'}`);
}
