/**
 * 用无头 Edge 渲染 hotro.hasaki.vn 政策页（浏览器已解码实体、展开折叠），
 * 从渲染后的 DOM 里取正文，生成 data/policy.json。
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '_probe', 'profile');
const TMP = path.join(ROOT, 'raw', 'policy-render');
fs.mkdirSync(TMP, { recursive: true });

const pages = {
  terms: 'dieu-khoan-su-dung',
  privacy: 'chinh-sach-bao-mat',
  return: 'doi-tra-hoan-tien',
  payment: 'huong-dan-thanh-toan-truc-tuyen-vnpay',
  shipping: 'quy-trinh-giao-hang',
  'order-guide': 'huong-dan-dat-hang-2h',
  cookie: 'chinh-sach-cookie',
  about: 'gioi-thieu-hasaki',
  branch: 'he-thong-cua-hang',
  contact: 'lien-he',
  guarantee: 'chinh-sach-bao-hanh-havatek',
  clinic: 'dich-vu-spa',
};

function render(url, name) {
  const dom = path.join(TMP, name + '.html');
  if (fs.existsSync(dom) && fs.statSync(dom).size > 5000) return fs.readFileSync(dom, 'utf8');
  const args = [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    '--proxy-server=127.0.0.1:7890', '--user-data-dir=' + PROFILE,
    '--window-size=1280,2000', '--virtual-time-budget=15000', '--dump-dom', url,
  ];
  try {
    const out = execFileSync(EDGE, args, { maxBuffer: 200 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
    fs.writeFileSync(dom, out, 'utf8');
    return out.toString('utf8');
  } catch (e) {
    console.log('render fail', url, e.message);
    return '';
  }
}

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    .replace(/<svg[\s\S]*?<\/svg>/gi, '');
}

function pick(html) {
  const clean = textOf(html);
  const start = clean.search(/class="[^"]*list_quest_support[^"]*"/i);
  let seg = start > 0 ? clean.slice(clean.indexOf('>', start) + 1) : clean;
  const stop = seg.search(/class="[^"]*(block_item_more_question|main_footer|multi-channel-contact)[^"]*"/i);
  if (stop > 800) seg = seg.slice(0, stop);
  seg = seg.slice(0, 90000);
  return seg
    .replace(/<(script|style|iframe|form|input|button|nav|header|footer|select|textarea)\b[\s\S]*?<\/\1>/gi, '')
    .replace(/<div class="hsk-chat-root"[\s\S]*?<\/div>/gi, '')
    .replace(/ on\w+="[^"]*"/g, '')
    .replace(/ class="[^"]*"/g, '')
    .replace(/ id="[^"]*"/g, '')
    .replace(/ style="[^"]*"/g, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function titleOf(html) {
  const strip = (s) => (s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]*>/i);
  if (og) {
    const c = og[0].match(/content=["']([^"']+)["']/i);
    if (c && c[1].trim()) return strip(c[1]);
  }
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) {
    const v = strip(t[1]).replace(/\s*\|\s*Hasaki.*$/i, '');
    if (v) return v;
  }
  const h = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return strip(h ? h[1] : '');
}

const out = {};
for (const [slug, file] of Object.entries(pages)) {
  const url = 'https://hotro.hasaki.vn/' + file + '.html';
  const html = render(url, file);
  if (!html) continue;
  out[slug] = { title: titleOf(html) || slug, source: url, html: pick(html) };
  console.log(slug.padEnd(14), String(out[slug].html.length).padStart(7), '|', out[slug].title.slice(0, 60));
}

const extra = {
  support: { title: 'Hỗ trợ khách hàng', html: '<p>Hotline: <b>1800 6324</b> (miễn phí, 08-22h kể cả T7, CN). Email: hotro@hasaki.vn</p>' },
  faq: { title: 'Câu hỏi thường gặp', html: '<p>Vui lòng gọi hotline <b>1800 6324</b> để được hỗ trợ nhanh nhất, hoặc xem hướng dẫn đặt hàng.</p>' },
  dermahair: { title: 'DermaHair', html: '<p>DermaHair — chuyên gia chăm sóc da đầu và tóc trực thuộc Hasaki.</p>' },
  career: { title: 'Tuyển dụng', html: '<p>Gửi CV về <b>tuyendung@hasaki.vn</b>.</p>' },
  handbook: { title: 'Hasaki cẩm nang', html: '<p>Cẩm nang làm đẹp, chăm sóc da và sức khỏe từ Hasaki.</p>' },
};
for (const [k, v] of Object.entries(extra)) if (!out[k]) out[k] = v;

fs.mkdirSync(path.join(ROOT, 'data'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'data', 'policy.json'), JSON.stringify(out));
console.log('keys', Object.keys(out).length, 'size', fs.statSync(path.join(ROOT, 'data', 'policy.json')).size);
