# Hasaki.vn 复刻站（越南 Hasaki 美妆）

`https://hasaki.vn/` 的 1:1 storefront 复刻 + 全套结账链路。纯静态站（Cloudflare Pages）+ Pages Functions，
**零运行时依赖、不需要 npm install**。商品、价格、图片、评分、评论、条款正文全部来自原站真实数据；
**售价统一按原站标价打 6 折**。

---

## 1. 交付形态

| 项 | 说明 |
|---|---|
| 首页 | `/` — 顶部品牌条 + 绿色 header + 二级导航 + hero 三图 + 8 个圆角快捷入口 + Flash Deals（倒计时）+ 品牌 sub-banner + 分类瓷片 + 品牌墙 + Bán chạy + Top tìm kiếm + 四列页脚 |
| 分类页 | `/catalog?slug=<cat>` — 左侧分类树（一/二/三级，带商品数）+ 价格区间 + 品牌复选；右侧排序 tab + 4 列商品卡 + 分页（40/页） |
| 商品页 | `/product?id=<id>` — 左缩略图列 + 大图 + 底部小图，右侧标题/英文名/评分/促销/六折价/规格/数量/加购/立即购买，右栏配送信任条 + 品牌卡 + 同款推荐；下方 6 个 tab（Mô tả / Thông số / Thành phần / HDSD / Đánh giá / Hỏi đáp） |
| 搜索 | `/search?q=` — 全量本地索引，越南语去音调归一化 + 多关键词包含匹配 + 品牌/价格筛选 |
| 购物车 | `/cart` — 改数量、删除、原价/节省/合计 |
| 结账页 | `/checkout` — 契约 §3/§4 的 head 三段顺序与 DOM，接 `/bp/` connector |
| 成功页 | `/order/<order_number>` — Pages Functions 按 **200 直出**，URL 不跳转 |
| 政策条款 | `/policy?slug=terms|privacy|return|payment|shipping|order-guide|cookie|about|branch|clinic|guarantee|contact` — 原站正文 |
| 品牌墙 | `/brands` |
| 会员 | `/register`（注册）、`/login`（登录，lenient 默认）、`/account`（资料/地址/订单历史）—— 老用户免校验密码直接登录，详见 §4.5 |
| 接口 | `GET /api/cart`、`POST /api/checkout`、`POST /api/customer/login|register|logout`、`GET /api/customer/me`、`POST /api/bp/verify` |
| 结账接管包 | `/bp/`（connector.js / connector.css / config.json / socket.io.min.js / bp-template-runtime.js / 3ds/img） |

商品规模随抓取时点变化：当前入库 **34,477 件在售商品**（原站 sitemap 全量 43,986 条，剔除原站本身无价的 9,509 条），每个商品带原站图集（原站本身无图的 SKU 用占位图）。

## 预览

| 页面 | 文件 |
|---|---|
| 首页 | `preview/home.png` |
| 分类页 | `preview/catalog.png` |
| 商品页 | `preview/product.png` |
| 购物车 | `preview/cart.png` |
| 结账页 | `preview/checkout.png` |
| 成功页 | `preview/order.png` |
| 登录 / 注册 / 账号 | `preview/login.png`、`preview/register.png`、`preview/account.png` |
| 政策页 | `preview/policy.png` |
| 移动端 | `preview/mobile-home.png`、`preview/mobile-product.png`、`preview/mobile-checkout.png`、`preview/mobile-catalog.png` |
| 促销弹窗（桌面 / 手机） | `preview/promo-modal-desktop.png`、`preview/promo-modal-mobile.png` |
| 促销宣传图（1:1 / 4:5） | `preview/promo-40off.png`（2160×2160）、`preview/promo-40off-4x5.png`（2160×2700） |

---

## 2. 价格口径（全站唯一）

```
原站标价 market_price（VND，如 490.000 ₫）
  → 售价 sale = round(market_price × 0.6 / 100) × 100   （整数越南盾，取整到 100）
  → 展示 294.000 ₫，同时展示划线原价 490.000 ₫ 与 -40% 角标
```

- 前端唯一算价入口：`site/assets/app.js` 的 `HS.salePrice()`。
- 机器可读：`#bp-total[data-amount]`、`window.__BP_CART__.total`、`/api/cart.total`、`/api/checkout.amount` 全部是**整数越南盾**，四处同源（VND 最小单位就是 1 盾）。
- 购物车快照同时保存 `price`（售价）与 `market`（标价），用于展示"省了多少"。

---

## 3. Facebook 事件（全部由站点打，`/bp` 的像素仅作参考）

| 触发点 | 事件 | 位置 |
|---|---|---|
| 任意页面加载 | `PageView` | `site/assets/pixel.js` |
| 商品详情页 | `ViewContent` | `site/assets/product.js` → `HS.pixel.viewContent` |
| 点「GIỎ HÀNG」/「MUA NGAY」 | `AddToCart` | `site/assets/app.js` → `HS.cart.add` |
| 打开结账页 | `InitiateCheckout` | `site/assets/checkout.js` → `paint()` |
| **点支付 → 卡校验通过 → 验证屏弹起** | **`Purchase`** | `site/assets/pixel.js` 监听 `window` 的 **`bp:modal-open`**（connector 在验证屏弹出的同一刻派发该事件） |

- **`/bp/config.json` 的 `pixel_enabled` 已置 `false`**：connector 侧的购买事件关闭，避免一单两次。`bp/` 其余文件一个字节未改。
- Purchase 参数按需求**不带 `value/currency`**，只带 `content_type` / `content_ids` / `num_items` + 第三参 `{ eventID }`。
- 去重：`key = hash(设备指纹 | 单号)`，指纹 = UA + 语言 + 时区 + 屏幕 + DPR + 核数 + 平台 + Canvas + WebGL；记录 `localStorage.hs_px` + cookie `hs_px_c` 双写，24 小时内同 key 只打一次；同页面连点由内存锁拦住。
- 调试（控制台）：`HS.pixel.state()` / `HS.pixel.key()` / `HS.pixel.fingerprint()` / `HS.pixel.fire()` / `HS.pixel.reset()`。
- 填 Pixel ID：`site/assets/config.js` 不存在该文件，直接改 `site/assets/app.js` 顶部 `HS.config.fbPixelId`（留空/占位 `000…` 时完全不注入脚本）。

---

## 4. 促销弹窗（Promo modal）

站点绿主色（`#306E51 → #24503C` 渐变）+ 橙色 CTA（`#FF6A00`）+ 黄色强调（`#FFD400`），与全站色板一致。

| 项 | 说明 |
|---|---|
| 触发 | 首页 / 分类 / 搜索 / 商品页加载后 1.2s 弹出（`HS.config.promo.pages` 可改） |
| 版式 | 桌面：左右两栏卡片 `min(94vw, 880px)`；≤860px：单栏竖排 `min(94vw, 420px)`，字号 `clamp()` 连续缩放 |
| 倒计时 | `durationHours` 默认 1 小时，`HH:MM:SS`；结束时间写 `sessionStorage.hs_promo_end`（同会话内不重置） |
| 关闭记忆 | 关闭后写 `localStorage.hs_promo_closed_at`，`ttlHours` 默认 6 小时内不再弹 |
| 层级 | `z-index: 1500` —— **低于** `/bp` 验证屏的 `2147483000`，不会挡住 3DS 弹层 |
| CTA | 默认跳 `/deals`（`HS.config.promo.ctaHref`） |
| 调试 | 控制台 `HS.promo.reset()` 清记忆、`HS.promo.show()` 手动弹 |

配置在 `site/assets/app.js` 顶部 `HS.config.promo`：

```js
promo: {
  enabled: true,
  delayMs: 1200,        // 延迟弹出
  ttlHours: 6,          // 关闭后多久不再弹
  durationHours: 1,     // 倒计时时长
  pages: ['home', 'category', 'search', 'product'],
  ctaHref: '/deals',
  ctaText: 'Mua ngay',
}
```

> 商品图默认用本站真实在售 SKU（热链 `media.hcdn.vn`），换品改 `promo.products` 数组即可。
> 宣传图（`preview/promo-40off*.png`）与弹窗共用同一套配色与文案，改 `preview/promo-40off.html` 后
> `node _probe/promo-shot.mjs 1080 1080 2`（1:1）或 `node _probe/promo-shot.mjs 1080 1350 2 promo-40off-4x5.png`（4:5）重出。

---

## 4.5 会员与登录（lenient 口径）

| 场景 | 行为 |
|---|---|
| **老用户登录** | 邮箱（不区分大小写）在账号表里 → **不校验密码**，直接登录成功，返回 `is_returning: true` + 带出资料（姓名/手机/会员等级/积分/地址/订单数） |
| 新邮箱首次登录 | 任意非空账号 + 密码即建号并登录（不再二次确认） |
| 登录页 | 检测到本机账号 → 顶部绿条「Chào mừng trở lại, <姓名>」，并自动填好邮箱 |
| 注册 | 服务端真校验：姓名 / 邮箱格式 / 密码 ≥6 位 / 两次一致 / 条款勾选；通过即写入账号表并自动登录 |
| 账号页 | 资料（姓名/邮箱/手机/会员等级/入会日期/积分）+ 收货地址 + 最近订单 + 退出 |
| 退出 | 只清会话（`hs_user`），**保留账号表**（`hs_accounts`），下次登录仍带出资料 |
| 存储 | 纯 cookie：`hs_accounts`（最多 8 个账号）+ `hs_user`（会话，30 天），无服务端存储、无需建库 |

接口：`POST /api/customer/login`、`POST /api/customer/register`、`POST /api/customer/logout`、`POST /api/customer/update`、
`GET /api/customer/me`、`GET /api/customer/accounts`。

> 会员等级按积分自动算：`Kim Cương ≥5,000,000` / `Bạch Kim ≥2,000,000` / `Vàng ≥500,000` / 其余 `Thành viên mới`。
> 这是仿站演示口径（真站用短信 OTP + 服务端账号库）；要切严格模式，把 `functions/api/customer/[[action]].js` 的 login 分支改成校验密码即可。

---

## 5. 结账契约落地对照（《建站结账页契约》v1.0）

| 契约条目 | 实现位置 |
|---|---|
| §2 路由 `/checkout` | `site/checkout.html` + 构建时额外生成 `dist/checkout/index.html`（`/checkout` 与 `/checkout/` 都 200，不 301） |
| §2 `/bp/` 绝对路径 | `site/checkout.html` head 里写死 `/bp/connector.css`、`/bp/connector.js` |
| §3 head 三段顺序 | UTM 捕获内联 → `window.__BP_CART__` 骨架 → connector 资源，顺序固定；**全站每个页面都有 UTM 捕获** |
| §3 无 `<base>` | 全站无 `<base>`（verify 会查） |
| §4 六个固定 id | `#bp-card-number/-expiry/-cvc`、`#bp-total`、`#bp-error`、`#bp-submit` 全部原生 input/div |
| §4 `.bp-card-fields` | 卡三字段外层带 `.bp-card-fields`，等待时 connector 只淡化这块 |
| §4.1 三处同源 | `checkout.js` 的 `paint()` + `#bp-total` + `/api/cart` |
| §4.1 按钮不禁用 | `#bp-submit` 只用 `aria-busy`，不设 `disabled` |
| §4.2 首屏渲染卡表单 | 卡表单在结账页静态 HTML 里，不做二段式 |
| §5.1 原地 mutate | `checkout.js` 只改 `window.__BP_CART__` 字段，不换对象 |
| §5.2 `GET /api/cart` | `functions/api/cart.js`（读前端同步的 `hs_cart` / `hs_order` cookie） |
| §6.1 `POST /api/checkout` | `functions/api/checkout.js`：永远 200+JSON、单号原样回传、幂等、Origin 同源校验、不 302 |
| §6.2 直通关闭 | `bp/config.json` 原样（`guard_mode=always`、`allow_direct=false`）。站点侧 `checkout.js` **不注册 submit、不 POST、不设超时、不提前建单** |
| §6.3 守卫期配合 | 等待期间站点不跳转、不清空表单、不禁用按钮 |
| §7.1 方案 A CSP | `public/_headers` + `functions/_middleware.js` 双份：`script-src 'self' 'unsafe-inline'`（无 nonce/hash）、`frame-src 'self' https://annangourmet.makeup`、`connect-src … wss://annangourmet.makeup`、`base-uri 'self'`、无 sandbox、无 XFO DENY |
| §8 禁止清单 | 无托管支付字段、无跨域 iframe 卡表单、无 Shadow DOM、无 Service Worker、无 `iframe{display:none}` |
| §10 `bp/config.json` | 原样照搬（v20261121），**唯一改动**：`pixel_enabled: false`（购买事件改由站点打） |

> 面板域名：`wss://annangourmet.makeup`（`bp/config.json` 的 `panel_host`，`_headers` / `_middleware` 的 `frame-src` 已放行）。

---

## 6. 目录结构

```
.
├─ site/                       # 页面源（构建时复制到 dist 根）
│  ├─ index.html  catalog.html  product.html  search.html  cart.html
│  ├─ checkout.html            # 契约 §3 head 三段 + §4 DOM
│  ├─ order.html  login.html  register.html  account.html  policy.html
│  ├─ deals.html  brands.html
│  └─ assets/                  # base.css / app.js / pixel.js / home.js / catalog.js / product.js
│                              # cart.js / checkout.js / order.js / auth.js / policy.js / brands.js
│                              # logo-hasaki.png / favicon.png / placeholder.svg
├─ data/                       # 构建数据（parse.mjs 产物）
│  ├─ index.json               # 全量轻量索引（紧凑行）
│  ├─ p/<bucket>.json          # 商品详情（bucket = floor(id/500)）
│  ├─ rv/<bucket>.json         # 评分分布 + 真实评论
│  ├─ cat/<slug>.json          # 末级类目的商品行
│  ├─ categories.json          # 分类树（一/二/三级 + 计数）
│  ├─ brands.json  home.json  policy.json
├─ public/                     # 直接铺到 dist 根
│  ├─ _headers                 # CSP（方案 A）+ 缓存策略
│  └─ _redirects
├─ functions/                  # Cloudflare Pages Functions
│  ├─ _middleware.js           # 全站 CSP/安全头
│  ├─ api/cart.js  api/checkout.js  api/bp/verify.js
│  ├─ api/customer/[[action]].js
│  └─ order/[[path]].js        # /order/<no> 200 直出
├─ bp/                         # 契约包，原样放站点根 /bp/
├─ scripts/
│  ├─ fetch-lib.mjs            # 抓取层（curl + 本机代理 127.0.0.1:7890）
│  ├─ fetch-inventory.mjs      # sitemap → raw/inventory.json
│  ├─ fetch-detail.mjs         # 详情 + 评论 → raw/detail、raw/reviews
│  ├─ fetch-policy-render.mjs  # 政策页渲染抓取 → data/policy.json
│  ├─ parse.mjs                # raw → data/
│  ├─ build.mjs                # site+public+data+bp → dist
│  ├─ serve.mjs                # 本地预览（模拟 Pages 路由 + Functions）
│  ├─ verify.mjs               # 契约自检
│  └─ e2e.mjs                  # 真 Edge 端到端
├─ raw/                        # 抓取原件（.gitignore，不入库）
├─ dist/                       # 构建输出（.gitignore，不入库）
├─ wrangler.toml
└─ package.json
```

---

## 7. 常用命令

```bash
node scripts/build.mjs     # 生成 dist/（Pages 的 Build command 就是这个；npm run build 等价）
node scripts/serve.mjs     # 本地预览 http://127.0.0.1:4173（模拟 Pages 路由 + 各接口）
node scripts/verify.mjs    # 契约自检（先起 serve）
node scripts/e2e.mjs       # 真浏览器端到端（先起 serve）
node scripts/parse.mjs     # raw/ → data/（只有换数据时才跑）
node scripts/fetch-inventory.mjs   # 抓全量商品清单
node scripts/fetch-detail.mjs      # 抓详情 + 评论（断点续跑）
node scripts/fetch-policy-render.mjs  # 抓政策页正文
```

> Windows 上 PowerShell 可能禁止 `npm.ps1`，直接用 `node scripts/xxx.mjs` 最稳。

---

## 8. 部署到 Cloudflare Pages

### 先推到 GitHub

```bash
git init
git add .
git commit -m "Hasaki.vn storefront clone: full catalog + 6-fold pricing + /bp checkout"
git branch -M main
git remote add origin https://github.com/<账号>/<仓库名>.git
git push -u origin main
```

入库内容：`site/ data/ public/ functions/ bp/ scripts/ preview/` + 配置。
已排除：`raw/`（抓取原件）、`_probe/`、`dist/`、`node_modules/`、`.wrangler/`。

### Pages 项目设置

| 设置项 | 值 |
|---|---|
| Framework preset | `None` |
| Build command | `npm run build`（或 `node scripts/build.mjs`） |
| Build output directory | `dist` |
| Node version | `22`（环境变量 `NODE_VERSION=22`） |
| Functions directory | `functions/`（默认） |

命令行也能推：

```bash
npx wrangler pages deploy dist --project-name hasaki-vn-clone
```

### 部署后必须自检的路径

```bash
curl -sI  https://<站点>/checkout            # 200，无 Location，CSP 含 frame-src … https://annangourmet.makeup
curl -s -o /dev/null -w '%{http_code}\n' https://<站点>/bp/connector.js
curl -s -o /dev/null -w '%{http_code}\n' https://<站点>/bp/3ds/img/visa.svg
curl -s  https://<站点>/api/cart
curl -s -X POST https://<站点>/api/checkout -H 'Content-Type: application/json' \
     -d '{"order_number":"ORD-20261122-ABCD","amount":129900,"currency":"VND"}'
```

> **文件数**：Cloudflare Pages 单次部署上限 20,000 个文件。本站构建产物约 900 个文件（页面 14 + 目录副本 11 + data 分片 ~700 + 资源），远低于上限。

---

## 9. 数据来源与抓取口径

- 原站出口被 Hasaki WAF 拦截（本机直连全站 403，node TLS 指纹同样被拦）；抓取一律走本机代理 `127.0.0.1:7890` + `curl`。
- 商品清单：`https://hasaki.vn/sitemap.xml` → 37 个子 sitemap（`product-off-web.xml` 46,023 条 + 各分类 sitemap + canonical），按商品 id 去重后 **43,986** 条。
- 商品详情：`GET /mobile/v3/detail/product?product_id=<id>&full=1` → `CommonInfo`（价格/库存/活动/评分/图集/分类路径）+ `DescriptionInfo`（描述正文）+ `SpecificationInfo`（规格表）+ `IngredientInfo` + `GuideInfo` + `ShortRatingInfo`（评分与首屏带图评论）。
- 评论：`GET /mobile/v1/detail/product/comments?product_id=<id>&page=1`。**全站 34,477 个商品里 5,287 个有本商品真实评论**（共 17,000+ 条，含 Hasaki 官方回复与点赞数）；
  其余商品按「同系列 → 同品牌」挂真实评论并**显式标注来源**（`Nhận xét từ khách hàng đã mua sản phẩm cùng dòng / cùng thương hiệu`），
  覆盖率 93%（32,098 / 34,477），剩下 2,379 个品牌本身无任何评论的商品显示空态文案，**不编造评价**。
  原站只有 9.5% 商品有星级评分（3,261 个），这部分全部拉到。
- 图片：`media.hcdn.vn` 可直连，站内**热链**，不下载二进制；原站无图的 SKU 用 `/assets/placeholder.svg`。
- 条款正文：`hotro.hasaki.vn` 的政策页，用无头 Edge 渲染后提取正文（浏览器已解码实体、展开折叠）。
- 分类树：由商品详情的 `category_list`（一级→末级路径）聚合出 162 个类目，附商品计数。

### 想换成"图片也本地化"

逐条下载 `data` 里的图到 `site/img/`，再把前缀改成 `/img/`。注意 Pages 单次部署上限 20,000 文件，
正式做法是把图放 R2，用 `/img/*` 反代。

---

## 10. 已知取舍

| 项 | 现状 |
|---|---|
| 商品数量 | sitemap 全量（43,986 条去重后入库；无价/下架 SKU 剔除） |
| 销量 | 详情接口不返回真实销量（`bought_count` 恒为 0），卡片改用"评分 + 评价数"与活动进度条 |
| 商品变体（容量/色号） | 原站是独立 SKU，本站不做联动切换；同类目/同品牌推荐可达到同等效果 |
| 会员/下单后端 | 只复刻 storefront 与结账外壳；账号落 cookie，订单落前端 sessionStorage，真实支付由 `/bp/` 面板通道处理 |
| 搜索 | 本地对 `data/index.json` 做去音调包含匹配（原站是服务端搜索） |
| 多语言 | 界面越南语（`lang="vi"`），connector 按此选表单文案 |

---

## 11. 自检记录

```
[verify] pass=84 fail=0     # 契约 §9 十条 + 本项目追加项
[e2e]    pass=60 fail=0     # 真 Edge：首页 → 加购 → 购物车 → 结账 → 提交守卫 → Purchase → 搜索 → 登录（含老用户免校验）→ 政策 → 弹窗 → /order
```

覆盖：

- **契约侧**：结账页 200/无 Location/CSP 四条铁律（`frame-src` 放行面板域、`script-src` 无 nonce、`base-uri 'self'`、`connect-src` 带 `wss://`、无 sandbox、无 XFO DENY）、6 个固定 id、`#bp-total` 三处同源、UTM 在 connector 之前、`/bp/*` 九个资源全 200、`bp/config.json` 关键字段、站点侧不自己 POST、`/api/cart` 结构、`/api/checkout` 200+幂等+单号原样回传、`/order/<no>` 200、页面与数据分片可读、禁止清单、像素归属。
- **链路侧**：首页卡片/侧栏分类渲染 → `PageView` + `AddToCart` → 商品页（六折价 + 划线价 + `ViewContent`）→ 购物车改数量 → 结账页（三字段、单号、`data-amount` 与 `__BP_CART__.total` 一致、UTM 落 sessionStorage）→ 点支付后不跳转、connector 进入守卫态 → 模拟 `bp:modal-open` → `Purchase` 打一次且不重复 → `/order/<单号>` 正常显示。

---

*本项目为内部复刻/联调用；`/bp/` 目录由面板方提供，站点侧只改了 `config.json` 的 `pixel_enabled` 一项。*
