/**
 * 抓 hotro.hasaki.vn 的政策/条款正文，生成 site 用的 data/policy.json。
 * 只保留正文（去脚本、导航、广告），转成受控 HTML 片段。
 */
import fs from 'node:fs';
import path from 'node:path';
import { curlGet, curlBatch } from './fetch-lib.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const RAW = path.join(ROOT, 'raw', 'policy');
fs.mkdirSync(RAW, { recursive: true });

const BASE = 'https://hotro.hasaki.vn';
const r = curlGet(BASE + '/');
if (r.status !== 200) throw new Error('hotro home -> ' + r.status);

const links = [...new Set([...r.body.matchAll(/href="([^"]*?\.html)"/g)].map((m) => m[1]))]
  .map((h) => (h.startsWith('http') ? h : BASE + '/' + h.replace(/^\/+/, '')))
  .filter((u) => u.includes('hotro.hasaki.vn'));
console.log('links', links.length);
console.log(links.slice(0, 60).join('\n'));

const jobs = links.map((u) => ({ url: u, out: u.split('/').pop().replace(/[^\w.\-]/g, '_') }))
  .filter((j) => !fs.existsSync(path.join(RAW, j.out)));
if (jobs.length) {
  const res = curlBatch(jobs, { concurrency: 4, cwd: RAW });
  console.log('fetched', res.ok.length, 'fail', res.fail.length);
}

function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
}

function pickBody(html) {
  const clean = toText(html);
  let seg = '';
  const start = clean.search(/class="[^"]*list_quest_support[^"]*"/i);
  if (start > 0) {
    let s2 = clean.slice(Math.max(0, start - 200));
    const endIdx = s2.search(/class="[^"]*(block_item_more_question|main_footer)[^"]*"/i);
    seg = endIdx > 800 ? s2.slice(0, endIdx) : s2.slice(0, 120000);
  } else {
    const i = clean.search(/<(article|div)[^>]*(class|id)="[^"]*(detail|content|post-body|entry|main-content|page-content)[^"]*"/i);
    seg = i >= 0 ? clean.slice(i) : clean;
    seg = seg.slice(0, 120000);
    const end = seg.search(/<footer|<\/article>/i);
    if (end > 500) seg = seg.slice(0, end);
  }
  return seg
    .replace(/<(script|style|iframe|form|input|button|nav|header|footer|select)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<div[^>]*class="[^"]*(breadcrumb|breakcrumb|menu_col_left|block_menu_col_left|block_search_support|block_banner_support)[^"]*"[\s\S]*?(?=<div class="[^"]*(list_quest|main_page))/gi, '')
    .replace(/ on\w+="[^"]*"/g, '')
    .replace(/ class="[^"]*"/g, '')
    .replace(/ id="[^"]*"/g, '')
    .replace(/ style="[^"]*"/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function titleOf(html) {
  const m = html.match(/<title>([\s\S]*?)<\/title>/i);
  const h = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  return strip(h ? h[1] : m ? m[1] : '');
}

const map = {
  'chinh-sach-bao-mat': 'privacy',
  'dieu-khoan-su-dung': 'terms',
  'chinh-sach-doi-tra': 'return',
  'phuong-thuc-thanh-toan': 'payment',
  'phuong-thuc-van-chuyen': 'shipping',
  'huong-dan-dat-hang': 'order-guide',
  'chinh-sach-cookie': 'cookie',
  'gioi-thieu': 'about',
};

const out = {};
for (const f of fs.readdirSync(RAW)) {
  if (!f.endsWith('.html')) continue;
  const slugRaw = f.replace(/\.html$/, '');
  const slug = map[slugRaw] || slugRaw;
  const html = fs.readFileSync(path.join(RAW, f), 'utf8');
  out[slug] = { title: titleOf(html) || slug, html: pickBody(html).slice(0, 60000) };
  console.log(slug, (out[slug].html || '').length);
}

/* 补几个站点自定义页 */
out['support'] = out['support'] || { title: 'Hỗ trợ khách hàng', html: '<p>Hotline: <b>1800 6324</b> (miễn phí, 08-22h kể cả T7, CN). Hoặc gửi yêu cầu qua email hotro@hasaki.vn.</p>' };
out['faq'] = out['faq'] || { title: 'Câu hỏi thường gặp', html: '<p>Vui lòng gọi hotline 1800 6324 để được hỗ trợ nhanh nhất.</p>' };
out['branch'] = out['branch'] || { title: 'Hệ thống cửa hàng', html: '<p>Hasaki hiện có 352 chi nhánh trên toàn quốc. Giao nhanh miễn phí 2H nội thành TP.HCM và Hà Nội.</p>' };
out['guarantee'] = out['guarantee'] || { title: 'Bảo hành & đổi trả', html: out['return'] ? out['return'].html : '<p>Đổi trả miễn phí trong 30 ngày.</p>' };
out['clinic'] = out['clinic'] || { title: 'Hasaki Clinic & Spa', html: '<p>Hệ thống phòng khám và spa chuyên sâu của Hasaki.</p>' };
out['dermahair'] = out['dermahair'] || { title: 'DermaHair', html: '<p>Chuyên gia chăm sóc da đầu và tóc.</p>' };
out['career'] = out['career'] || { title: 'Tuyển dụng', html: '<p>Gửi CV về tuyendung@hasaki.vn.</p>' };
out['contact'] = out['contact'] || { title: 'Liên hệ', html: '<p>Hotline 1800 6324 · hotro@hasaki.vn</p>' };
out['handbook'] = out['handbook'] || { title: 'Hasaki cẩm nang', html: '<p>Cẩm nang làm đẹp và chăm sóc sức khỏe từ Hasaki.</p>' };

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'policy.json'), JSON.stringify(out));
console.log('policy.json written, keys:', Object.keys(out).length, 'size:', fs.statSync(path.join(ROOT, 'data', 'policy.json')).size);
