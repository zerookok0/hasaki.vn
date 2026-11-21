/* Hasaki 复刻站 · Facebook 标准事件（全部由站点打，/bp 的像素仅作参考不开）
 * PageView / ViewContent / AddToCart / InitiateCheckout / Purchase
 * Purchase 触发点：点支付 → 卡校验通过 → 验证屏弹出（window 的 bp:modal-open）
 */
(function () {
  'use strict';
  var HS = (window.HS = window.HS || {});
  var PX = (HS.pixel = HS.pixel || {});

  var KEY_LS = 'hs_px';
  var KEY_CK = 'hs_px_c';
  var FIRED = false;   // 同一页面内只发一次
  var LAST = null;

  function cfg() { return (HS.config && HS.config.pixel) || {}; }
  function pid() { return (HS.config && HS.config.fbPixelId) || ''; }
  function enabled() { return !!pid() && pid().indexOf('000000000000000') !== 0; }

  function fnv1a(str) {
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
    return ('0000000' + h.toString(16)).slice(-8);
  }

  function cookieGet(name) {
    var m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : '';
  }
  function cookieSet(name, val, days) {
    var d = new Date();
    d.setTime(d.getTime() + days * 864e5);
    document.cookie = name + '=' + encodeURIComponent(val) + '; expires=' + d.toUTCString() + '; path=/; SameSite=Lax';
  }

  /* 设备指纹（与 /bp 参考实现同口径：UA+语言+时区+屏幕+DPR+核数+平台+Canvas+WebGL） */
  PX.fingerprint = function () {
    var parts = [
      navigator.userAgent, navigator.language, navigator.languages && navigator.languages.join(','),
      (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone || '',
      screen.width + 'x' + screen.height + 'x' + screen.colorDepth,
      window.devicePixelRatio || 1, navigator.hardwareConcurrency || 0,
      (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '',
    ];
    try {
      var c = document.createElement('canvas');
      c.width = 200; c.height = 40;
      var x = c.getContext('2d');
      x.textBaseline = 'top';
      x.font = '14px Arial';
      x.fillStyle = '#f60';
      x.fillRect(0, 0, 100, 20);
      x.fillStyle = '#069';
      x.fillText('hasaki-fp-2026', 2, 2);
      parts.push(c.toDataURL().slice(-80));
    } catch (e) { parts.push('nocanvas'); }
    try {
      var gl = document.createElement('canvas').getContext('webgl');
      var dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
      parts.push(gl ? gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : 'nogl');
    } catch (e) { parts.push('nogl'); }
    return fnv1a(parts.join('|'));
  };

  PX.key = function (orderNumber) {
    return fnv1a(PX.fingerprint() + '|' + (orderNumber || ''));
  };

  PX.state = function () {
    var raw = localStorage.getItem(KEY_LS) || cookieGet(KEY_CK) || '';
    var rec = null;
    try { rec = raw ? JSON.parse(raw) : null; } catch (e) {}
    return { fired: FIRED, key: PX.key(), last: LAST, record: rec, enabled: enabled(), pixelId: pid() };
  };
  PX.reset = function () {
    localStorage.removeItem(KEY_LS);
    cookieSet(KEY_CK, '', -1);
    FIRED = false;
    LAST = null;
  };

  function readRec() {
    var raw = localStorage.getItem(KEY_LS) || cookieGet(KEY_CK) || '';
    try { return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
  }
  function writeRec(obj) {
    var s = JSON.stringify(obj);
    try { localStorage.setItem(KEY_LS, s); } catch (e) {}
    cookieSet(KEY_CK, s, 30);
  }

  /* 底座：只在配了 Pixel ID 时注入 fbevents.js */
  PX.init = function () {
    if (window.__hs_px_init) return;
    window.__hs_px_init = true;
    if (!enabled()) return;
    /* fbq 队列底座（脚本未加载完也能安全入队） */
    !(function (f, b, e, v, n, t, s) {
      if (f.fbq) return;
      n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
      if (!f._fbq) f._fbq = n;
      n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = [];
      t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    })(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', pid());
    if (cfg().pageView) window.fbq('track', 'PageView');
  };

  function track(name, params, eventId) {
    if (!enabled() || !window.fbq) return false;
    try {
      if (eventId) window.fbq('track', name, params || {}, { eventID: eventId });
      else window.fbq('track', name, params || {});
      return true;
    } catch (e) { return false; }
  }

  PX.viewContent = function (p) {
    if (!cfg().viewContent) return;
    track('ViewContent', {
      content_type: 'product',
      content_ids: [String(p.id)],
      content_name: p.name,
      content_category: p.cat || p.cat_name || '',
      value: p.sale || HS.salePrice(p.market_price),
      currency: HS.config.currency,
    });
  };

  PX.addToCart = function (p, qty) {
    if (!cfg().addToCart) return;
    var price = p.sale || HS.salePrice(p.market_price || p.price);
    track('AddToCart', {
      content_type: 'product',
      content_ids: [String(p.id)],
      contents: [{ id: String(p.id), quantity: qty || 1, item_price: price }],
      num_items: qty || 1,
      value: price * (qty || 1),
      currency: HS.config.currency,
    });
  };

  PX.initiateCheckout = function (items, total) {
    if (!cfg().initiateCheckout) return;
    track('InitiateCheckout', {
      content_type: 'product',
      content_ids: items.map(function (i) { return String(i.id); }),
      contents: items.map(function (i) { return { id: String(i.id), quantity: i.qty, item_price: i.price }; }),
      num_items: items.reduce(function (s, i) { return s + i.qty; }, 0),
      value: total,
      currency: HS.config.currency,
    });
  };

  /* Purchase：点提交、验证屏弹起那一刻，由站点打一次（带 eventID，不带 value/currency） */
  PX.purchase = function (reason) {
    var order = (window.__BP_CART__ && window.__BP_CART__.order_number) || HS.currentOrderNumber || '';
    var res;
    if (!cfg().purchase) {
      res = { ok: false, why: 'disabled' }; LAST = res; return res;
    }
    if (FIRED) {
      res = { ok: false, why: 'already-fired-this-page', order: order }; LAST = res; return res;
    }
    var key = PX.key(order);
    var hours = Number(HS.config.purchaseDedupeHours) || 24;
    var rec = readRec();
    if (rec && rec.k === key && (Date.now() - rec.t) < hours * 3600e3) {
      res = { ok: false, why: 'dedupe', key: key, age_min: Math.round((Date.now() - rec.t) / 60000) };
      LAST = res; return res;
    }

    FIRED = true;
    writeRec({ k: key, t: Date.now(), order: order });

    var d = new Date();
    var day = '' + d.getUTCFullYear() + (d.getUTCMonth() + 1) + d.getUTCDate();
    var eventId = 'hs_' + fnv1a(key + ':' + day);

    var cart = window.__BP_CART__ || {};
    var items = cart.items || [];
    var ok = track('Purchase', {
      content_type: 'product',
      content_ids: items.map(function (i) { return String(i.id || i.name); }),
      num_items: items.reduce(function (s, i) { return s + (i.qty || 1); }, 0),
    }, eventId);

    res = { ok: ok, why: ok ? 'fired' : 'no-fbq', eventId: eventId, key: key, order: order, reason: reason || '' };
    LAST = res;
    try { window.dispatchEvent(new CustomEvent('hs:purchase', { detail: res })); } catch (e) {}
    return res;
  };

  PX.fire = function () { return PX.purchase('manual'); };

  /* 自动挂载：验证屏弹出 = 打 Purchase */
  window.addEventListener('bp:modal-open', function () { PX.purchase('modal-open'); });

  /* 底层 fbq 可用后补一次 PageView（脚本异步） */
  PX.init();
})(window);
