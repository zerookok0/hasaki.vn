/**
 * 端到端自检（真 Edge + CDP）：首页 → 商品 → 加购 → 购物车 → 结账 → 提交守卫 → Purchase → /order
 * 用法：先 `node scripts/serve.mjs`，再 `node scripts/e2e.mjs [baseUrl]`
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:4173';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9333;
const ROOT = path.resolve(import.meta.dirname, '..');
const PROFILE = path.join(ROOT, '_probe', 'e2e-profile');

let pass = 0, fail = 0;
const fails = [];
function ok(name, cond, detail) {
  if (cond) { pass++; console.log('  PASS', name); }
  else { fail++; fails.push(name + (detail ? ' :: ' + detail : '')); console.log('  FAIL', name, detail || ''); }
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

/* ---------------- CDP ---------------- */
class CDP {
  constructor(wsUrl) { this.wsUrl = wsUrl; this.id = 0; this.pending = new Map(); }
  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((res, rej) => {
      this.ws.addEventListener('open', res, { once: true });
      this.ws.addEventListener('error', rej, { once: true });
    });
    this.ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (e) { return; }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(msg.error.message)); else resolve(msg.result);
      }
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) { this.pending.delete(id); reject(new Error('cdp timeout ' + method)); }
      }, 45000);
    });
  }
  async goto(url) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 60; i++) {
      await sleep(250);
      try {
        const r = await this.eval('document.readyState');
        if (r === 'complete') { await sleep(600); return; }
      } catch (e) {}
    }
  }
  async eval(expr) {
    const r = await this.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || ''));
    return r.result && r.result.value;
  }
}

async function newPage(url) {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
  const j = await r.json();
  return j.webSocketDebuggerUrl;
}

async function waitFor(fn, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { if (await fn()) return true; } catch (e) {}
    await sleep(250);
  }
  return false;
}

/* ---------------- 主流程 ---------------- */
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=' + PORT, '--remote-allow-origins=*',
  '--user-data-dir=' + PROFILE, '--window-size=1440,1000', 'about:blank',
], { stdio: ['ignore', 'ignore', 'ignore'] });

try {
  /* 等调试端口 */
  let ready = false;
  for (let i = 0; i < 40; i++) {
    await sleep(300);
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { ready = true; break; } } catch (e) {}
  }
  if (!ready) throw new Error('Edge CDP 未启动');

  const ws = await newPage(BASE + '/');
  const cdp = new CDP(ws);
  await cdp.connect();
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  /* 关键：禁用 HTTP 缓存，避免 assets/* 的 immutable 缓存命中旧 CSS/JS */
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  /* 清掉上次残留的购物车 / 弹窗记忆 */
  await cdp.goto(BASE + '/');
  await cdp.eval("(function(){try{localStorage.clear();sessionStorage.clear();}catch(e){}})()");

  /* 1. 首页 */
  console.log('\n[1] 首页');
  await cdp.goto(BASE + '/');
  await sleep(1200);
  const cards = await cdp.eval("document.querySelectorAll('#flash-slot .card, #topsearch-slot .card').length");
  ok('首页渲染商品卡', cards > 0, 'cards=' + cards);
  const navCount = await cdp.eval("document.querySelectorAll('.hs-nav a').length");
  ok('顶部导航渲染', navCount >= 6, 'links=' + navCount);
  const heroImgs = await cdp.eval("document.querySelectorAll('#hero-slot img').length");
  ok('hero 图渲染', heroImgs >= 3, 'imgs=' + heroImgs);

  /* 2. 商品页 */
  console.log('\n[2] 商品页');
  const pid = await cdp.eval("(async()=>{const r=await fetch('/data/index.json');const j=await r.json();const row=j.rows.find(x=>x[5])||j.rows[0];return row[0];})()");
  await cdp.goto(BASE + '/product?id=' + pid, 800);
  /* 商品页要等 data 分片 + 推荐位（index 7.4MB）加载完 */
  for (let i = 0; i < 60; i++) {
    await sleep(300);
    if (await cdp.eval("!!document.querySelector('.pd-title')")) break;
  }
  await sleep(600);
  const title = await cdp.eval("document.querySelector('.pd-title') ? document.querySelector('.pd-title').textContent : ''");
  ok('商品标题渲染', !!title, title.slice(0, 40));
  const nowPrice = await cdp.eval("document.querySelector('.pd-price .now') ? document.querySelector('.pd-price .now').textContent : ''");
  ok('六折价渲染', /₫/.test(nowPrice), nowPrice);
  const pv = await cdp.eval("(function(){try{return HS.pixel.state().fired}catch(e){return 'err'}})()");
  ok('HS.pixel 可用', pv !== 'err');

  /* 3. 加购 */
  console.log('\n[3] 加购');
  await cdp.eval("document.getElementById('pd-add').click()");
  await sleep(600);
  const cartCount = await cdp.eval("(function(){try{return HS.cart.count()}catch(e){return -1}})()");
  ok('加购后购物车数量 = 1', cartCount === 1, 'count=' + cartCount);
  const badge = await cdp.eval("document.querySelector('[data-cart-count]').textContent");
  ok('页头购物车角标更新', badge === '1', 'badge=' + badge);

  /* 4. 购物车页 */
  console.log('\n[4] 购物车');
  await cdp.goto(BASE + '/cart');
  await sleep(800);
  const rows = await cdp.eval("document.querySelectorAll('.cart-row').length");
  ok('购物车行数 = 1', rows === 1, 'rows=' + rows);
  const sum = await cdp.eval("document.getElementById('sum-total').textContent");
  ok('购物车合计有值', /₫/.test(sum), sum);

  /* 5. 结账页 */
  console.log('\n[5] 结账页');
  await cdp.goto(BASE + '/checkout?utm_source=fb&adset_id=E2E123&fbclid=E2E');
  await sleep(1200);
  const ids = await cdp.eval("document.querySelectorAll('#bp-card-number,#bp-card-expiry,#bp-card-cvc').length");
  ok('卡三字段存在', ids === 3, 'ids=' + ids);
  const same = await cdp.eval("window.__BP_CART__.total_amount === document.getElementById('bp-total').textContent");
  ok('#bp-total 与 __BP_CART__ 同源', same === true);
  const amountMatch = await cdp.eval("String(window.__BP_CART__.total) === document.getElementById('bp-total').dataset.amount");
  ok('data-amount 与 total 同源', amountMatch === true);
  const orderNo = await cdp.eval("window.__BP_CART__.order_number");
  ok('单号已生成', /^ORD-\d{8}-[0-9A-F]{4}$/.test(orderNo || ''), orderNo);
  const utm = await cdp.eval("(function(){try{return JSON.parse(sessionStorage.getItem('bp_utm')||'{}').adset_id||''}catch(e){return ''}})()");
  ok('UTM 落入 sessionStorage', utm === 'E2E123', utm);
  const total = await cdp.eval("window.__BP_CART__.total");
  ok('购物车金额 > 0', total > 0, 'total=' + total);

  /* 6. 提交 → 守卫态（不跳转、不自己建单） */
  console.log('\n[6] 提交守卫');
  await cdp.eval("(function(){var f=document.getElementById('t-name');if(f)f.value='Nguyen Van A';var e=document.getElementById('t-email');if(e)e.value='e2e@example.com';var a=document.getElementById('t-addr');if(a)a.value='12 Nguyen Hue';var c=document.getElementById('t-city');if(c)c.value='TP. HCM';var z=document.getElementById('t-zip');if(z)z.value='700000';})()");
  await cdp.eval("(function(){function set(id,v){var el=document.getElementById(id);el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));}set('bp-card-number','4242424242424242');set('bp-card-expiry','12/30');set('bp-card-cvc','123');})()");
  await sleep(400);
  await cdp.eval("document.getElementById('bp-submit').click()");
  await sleep(2500);
  const stillCheckout = await cdp.eval("location.pathname");
  ok('提交后未离开结账页', stillCheckout === '/checkout', stillCheckout);
  const mode = await cdp.eval("(function(){try{return JSON.stringify(window.BPConnector&&BPConnector.mode?BPConnector.mode():{})}catch(e){return '{}'}})()");
  let modeObj = {};
  try { modeObj = JSON.parse(mode); } catch (e) {}
  ok('connector 进入守卫/等待态', modeObj.need_guard !== false && modeObj.allow_direct !== true, mode);
  const btnDisabled = await cdp.eval("document.getElementById('bp-submit').hasAttribute('disabled')");
  ok('提交按钮未被 disabled', btnDisabled === false);

  /* 7. Purchase 事件（站点侧，挂 bp:modal-open） */
  console.log('\n[7] Purchase');
  await cdp.eval("(function(){window.__px=[];window.fbq=function(){window.__px.push([].slice.call(arguments));};try{HS.config.fbPixelId='1234567890';}catch(e){}})()");
  const p1 = await cdp.eval("(function(){try{return JSON.stringify(HS.pixel.purchase('e2e'))}catch(e){return '{\"err\":\"'+e.message+'\"}'}})()");
  let r1 = {};
  try { r1 = JSON.parse(p1); } catch (e) {}
  ok('Purchase 打出一次', r1.ok === true, p1);
  ok('Purchase 带 eventID', !!(r1.eventId || '').startsWith('hs_'), r1.eventId);
  const pxCount1 = await cdp.eval("window.__px.filter(function(a){return a[1]==='Purchase'}).length");
  ok('fbq 收到 1 次 Purchase', pxCount1 === 1, 'n=' + pxCount1);
  const p2 = await cdp.eval("(function(){try{return JSON.stringify(HS.pixel.purchase('e2e-again'))}catch(e){return '{}'}})()");
  let r2 = {};
  try { r2 = JSON.parse(p2); } catch (e) {}
  ok('同一页面第二次不再打', r2.ok === false && r2.why === 'already-fired-this-page', p2);
  const pxCount2 = await cdp.eval("window.__px.filter(function(a){return a[1]==='Purchase'}).length");
  ok('fbq 仍然只收到 1 次', pxCount2 === 1, 'n=' + pxCount2);
  const pxNoValue = await cdp.eval("(function(){var hit=window.__px.filter(function(a){return a[1]==='Purchase'})[0]||[];var p=hit[2]||{};return !('value' in p)})()");
  ok('Purchase 不带 value/currency', pxNoValue === true);

  /* 8. /api/cart 与 /api/checkout 在浏览器里可用 */
  console.log('\n[8] 接口');
  const apiCart = await cdp.eval("(async()=>{const r=await fetch('/api/cart');const j=await r.json();return JSON.stringify({status:r.status,order:j.order_number,total:j.total,items:(j.items||[]).length});})()");
  let ac = {};
  try { ac = JSON.parse(apiCart); } catch (e) {}
  ok('/api/cart 200', ac.status === 200, apiCart);
  const apiCk = await cdp.eval("(async()=>{const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({order_number:'ORD-20261122-E2E1',amount:129900,currency:'VND'})});const j=await r.json();return JSON.stringify({status:r.status,ok:j.ok,order:j.order_number});})()");
  let ak = {};
  try { ak = JSON.parse(apiCk); } catch (e) {}
  ok('/api/checkout 200 + ok + 单号原样', ak.status === 200 && ak.ok === true && ak.order === 'ORD-20261122-E2E1', apiCk);

  /* 9. 成功页 */
  console.log('\n[9] 成功页');
  await cdp.goto(BASE + '/order/ORD-20261122-E2E1');
  await sleep(800);
  const odNo = await cdp.eval("document.getElementById('od-no').textContent");
  ok('/order/<no> 显示单号', odNo === 'ORD-20261122-E2E1', odNo);
  const noScrollX = await cdp.eval("document.documentElement.scrollWidth <= window.innerWidth + 1");
  ok('无横向溢出（1440）', noScrollX === true);

  /* 10. 搜索 */
  console.log('\n[10] 搜索');
  await cdp.goto(BASE + '/search?q=son', 600);
  await waitFor(async () => (await cdp.eval("document.querySelectorAll('#cat-grid .card').length")) > 0, 25000);
  const searchCards = await cdp.eval("document.querySelectorAll('#cat-grid .card').length");
  ok('搜索 son 有结果', searchCards > 0, 'cards=' + searchCards);
  const searchTitle = await cdp.eval("document.querySelector('.cat-title').textContent");
  ok('搜索标题显示关键词', /son/i.test(searchTitle), searchTitle);
  const noResult = await cdp.eval("(async()=>{const r=await fetch('/data/index.json');const j=await r.json();const kw='zzzzqqq';return j.rows.filter(x=>x[1].toLowerCase().indexOf(kw)>=0).length})()");
  ok('无关词无结果（索引正常）', noResult === 0);

  /* 11. 分类筛选 */
  console.log('\n[11] 分类页');
  await cdp.goto(BASE + '/catalog', 600);
  await waitFor(async () => (await cdp.eval("document.querySelectorAll('#cat-grid .card').length")) > 0, 30000);
  const catCards = await cdp.eval("document.querySelectorAll('#cat-grid .card').length");
  ok('分类页首屏 40 条', catCards > 0 && catCards <= 40, 'cards=' + catCards);
  const sideCats = await cdp.eval("document.querySelectorAll('#side .side-cat a').length");
  ok('侧栏分类树渲染', sideCats > 5, 'links=' + sideCats);
  const priceSort = await cdp.eval("(function(){var b=document.querySelector('[data-sort=\"asc\"]');if(!b)return null;b.click();return true})()");
  ok('排序 tab 可点击', priceSort === true);
  await waitFor(async () => {
    const p = await cdp.eval("(function(){return [].slice.call(document.querySelectorAll('#cat-grid .price-now')).slice(0,5).map(function(e){return parseInt(e.textContent.replace(/[^0-9]/g,''),10)})})()");
    return p.length > 1 && p.every((v, i, a) => i === 0 || a[i - 1] <= v);
  }, 15000);
  const prices = await cdp.eval("(function(){return [].slice.call(document.querySelectorAll('#cat-grid .price-now')).slice(0,5).map(function(e){return parseInt(e.textContent.replace(/[^0-9]/g,''),10)})})()");
  const ascOk = prices.length > 1 && prices.every((v, i, a) => i === 0 || a[i - 1] <= v);
  ok('价格升序生效', ascOk, JSON.stringify(prices));

  /* 12. 登录 / 账号 */
  console.log('\n[12] 会员');
  await cdp.goto(BASE + '/login', 600);
  await waitFor(async () => !!(await cdp.eval("document.getElementById('lg-email')")), 15000);
  await cdp.eval("(function(){document.getElementById('lg-email').value='e2e.user@example.com';document.getElementById('lg-pass').value='secret123';})()");
  await cdp.eval("document.querySelector('#auth-form button[type=submit]').click()");
  await waitFor(async () => (await cdp.eval('location.pathname')) === '/account', 15000);
  const afterLogin = await cdp.eval("location.pathname");
  ok('登录后进入账号页', afterLogin === '/account', afterLogin);
  await waitFor(async () => /@/.test(await cdp.eval("(document.querySelector('#acc-profile')||{}).textContent||''")), 15000);
  const accName = await cdp.eval("document.querySelector('#acc-profile') ? document.querySelector('#acc-profile').textContent : ''");
  ok('账号页显示资料', /e2e\.user@example\.com/.test(accName), accName.slice(0, 60));
  await sleep(400);
  const headerHi = await cdp.eval("document.querySelector('[data-auth-name]').textContent");
  ok('页头显示登录态', /Chào/.test(headerHi), headerHi);

  /* 老用户免校验：同一邮箱 + 错误密码也应登录成功并标记 is_returning */
  const relogin = await cdp.eval("(async()=>{const r=await fetch('/api/customer/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'e2e.user@example.com',password:'WRONG-PASSWORD-999'})});const j=await r.json();return JSON.stringify({ok:j.ok,is_returning:j.is_returning,name:(j.user||{}).name,tier:(j.user||{}).tier})})()");
  let rl = {};
  try { rl = JSON.parse(relogin); } catch (e) {}
  ok('老用户错误密码也登录成功', rl.ok === true, relogin);
  ok('返回 is_returning=true', rl.is_returning === true, relogin);
  ok('带出会员等级', !!rl.tier, rl.tier);

  /* 13. 政策页 */
  console.log('\n[13] 政策页');
  await cdp.goto(BASE + '/policy?slug=terms', 800);
  await waitFor(async () => (await cdp.eval("document.getElementById('pol-body').textContent.length")) > 2000, 20000);
  const polLen = await cdp.eval("document.getElementById('pol-body').textContent.length");
  ok('条款正文渲染', polLen > 2000, 'len=' + polLen);
  const polNav = await cdp.eval("document.querySelectorAll('#pol-nav a').length");
  ok('政策导航渲染', polNav > 8, 'links=' + polNav);

  /* 14. 移动端 375 */
  console.log('\n[14] 移动端 375');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: 2, mobile: true });
  for (const [label, path] of [
    ['首页', '/'], ['分类页', '/catalog'], ['搜索页', '/search?q=son'],
    ['商品页', '/product?id=' + pid], ['购物车', '/cart'], ['结账页', '/checkout'],
    ['政策页', '/policy?slug=terms'], ['登录页', '/login'],
  ]) {
    await cdp.goto(BASE + path);
    await sleep(1400);
    const noOverflow = await cdp.eval("document.documentElement.scrollWidth <= window.innerWidth + 1");
    ok('375 无横向溢出 · ' + label, noOverflow === true,
      'scrollW=' + (await cdp.eval('document.documentElement.scrollWidth')));
  }
  await cdp.goto(BASE + '/checkout');
  await sleep(1200);
  const cardVisible = await cdp.eval("(function(){const el=document.getElementById('bp-card-number');const r=el.getBoundingClientRect();return r.width>0&&r.top>=0&&r.top<window.innerHeight*3})()");
  ok('卡号输入框在首屏附近', cardVisible === true);

  /* 15. 促销弹窗（桌面 + 移动双端） */
  console.log('\n[15] 促销弹窗');
  await cdp.goto(BASE + '/');
  await sleep(300);
  await cdp.eval("(function(){try{HS.promo.reset()}catch(e){}})()");
  await cdp.goto(BASE + '/');
  let popup = false;
  for (let i = 0; i < 30; i++) { await sleep(200); if (await cdp.eval("!!document.getElementById('hs-promo-mask')")) { popup = true; break; } }
  ok('首页自动弹出', popup === true);
  const popupInfo = await cdp.eval("(function(){var el=document.querySelector('.hs-promo');if(!el)return '{}';var r=el.getBoundingClientRect();return JSON.stringify({w:Math.round(r.width),h:Math.round(r.height),inView:r.top>=0&&r.bottom<=innerHeight+2,clock:(document.querySelector('[data-clock]')||{}).textContent})})()");
  let pi = {};
  try { pi = JSON.parse(popupInfo); } catch (e) {}
  ok('弹窗在视口内（375）', !!pi.w && pi.inView === true, popupInfo);
  ok('倒计时格式 HH:MM:SS', /^\d{2}:\d{2}:\d{2}$/.test((pi.clock || '').trim()), pi.clock);
  const ctaText = await cdp.eval("(document.querySelector('[data-promo-cta]')||{}).textContent");
  ok('CTA 存在', /Mua ngay/.test(ctaText || ''), ctaText);
  await cdp.eval("document.querySelector('.hs-promo-close').click()");
  await sleep(500);
  const closed = await cdp.eval("!document.getElementById('hs-promo-mask')");
  ok('关闭后移除', closed === true);
  const remembered = await cdp.eval("(function(){try{return !!localStorage.getItem('hs_promo_closed_at')}catch(e){return false}})()");
  ok('关闭记忆已写入', remembered === true);
  await cdp.goto(BASE + '/');
  await sleep(2200);
  const notAgain = await cdp.eval("!document.getElementById('hs-promo-mask')");
  ok('刷新后不再弹（ttl 内）', notAgain === true);
  await cdp.send('Emulation.clearDeviceMetricsOverride');
} catch (e) {
  fail++;
  fails.push('E2E 异常: ' + e.message);
  console.log('  FAIL E2E 异常', e.message);
} finally {
  try { edge.kill(); } catch (e) {}
}

console.log(`\n[e2e] pass=${pass} fail=${fail}`);
if (fail) { console.log('FAILURES:'); fails.forEach((f) => console.log('  -', f)); process.exit(1); }
