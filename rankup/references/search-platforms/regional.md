# 区域搜索引擎：Naver、Yandex 与 DuckDuckGo

> 从 [`search-platforms.md`](../search-platforms.md) 拆出（2026-11-27）；顺序表与通用验证规则仍在主文件。

### 步骤 5：Naver Search Advisor（仅韩国市场）

**什么时候需要这一步：项目有韩文版（`/ko` 或 `.kr` 域名）才做。** 不做韩国市场可以跳过。

韩国人基本上都在用 Naver，整个 Naver 生态相当于百度 + 小红书 + 大众点评 + 抖音的合体。
Naver 虽然通过 IndexNow 被动接收 URL 推送，但 **Naver Search Advisor（站长工具）提供的
站点诊断、收录状态、搜索分析是 IndexNow 给不了的**——和 Bing/GSC 一样，不注册就没有数据。

入口：`https://searchadvisor.naver.com/`

自动化脚本：`scripts/naver-setup.mjs`（`status` / `register` / `submit-sitemap`）

```bash
# 查看注册状态
node <rankup-skill-dir>/scripts/naver-setup.mjs status --site example.com

# 注册站点并获取验证 meta 标签
node <rankup-skill-dir>/scripts/naver-setup.mjs register --site example.com

# 验证通过后提交 sitemap
node <rankup-skill-dir>/scripts/naver-setup.mjs submit-sitemap --site example.com
```

**CAPTCHA 限制：** 所有权验证需要人机验证，脚本会取出 meta 标签内容但无法自动完成验证点击。
用户部署 meta 标签后必须在浏览器中手动完成验证。

**输出是证据不是结论（2026-08-30 双证人化）：** `submit-sitemap` 每步截图落
`.rankup/evidence/naver-setup-<ts>/`，结束时报「页面回读命中/未命中哪些文案 +
suggested」。**eval 超时（读不到页面）不再被当成提交成功**——那只说明读不到，
成没成看最后一张截图。

#### 验证方式

与 Bing/GSC 同理，优先 HTML meta 标签：

```ts
{ name: "naver-site-verification", content: NAVER_SITE_VERIFICATION }
```

Naver 也支持 HTML 文件上传和 DNS TXT，选择逻辑与上面 GSC/Bing 一致。

#### 验证后要做的

1. **提交 sitemap**——`node <rankup-skill-dir>/scripts/naver-setup.mjs submit-sitemap --site example.com`，
   或在 Search Advisor 后台「要求 > Sitemap 提交」里手动提交，
   地址格式与 GSC/Bing 一致（`https://example.com/sitemap.xml`）。
2. **提交 RSS**——Naver 额外支持 RSS 订阅源提交，对博客/内容型站点有加速收录效果。
3. **查看「网站诊断」**——Naver 有自己的一套诊断标准，与 Google Lighthouse 不完全重叠，
   上线后跑一次，把结果记进 `.rankup/audit.md`。

#### 注意事项

- **Naver 账号注册可能需要韩国手机号验证**，这是用户本人的事，不代做。
  如果用户没有韩国手机号，可以尝试用邮箱注册的国际版流程。
- **日本以外的 Yahoo 用的是 Bing 引擎，日本 Yahoo 用的是 Google 引擎。**
  所以做日本市场不需要额外接 Yahoo，GSC 已经覆盖；做其他市场 Bing Webmaster 已经覆盖 Yahoo。
- **Naver 的爬虫 User-Agent 是 `Yeti`**，确认 `robots.txt` 没有误拦它。

### 步骤 6：Yandex Webmaster

**什么时候需要这一步：建议所有站点都接。** Yandex 是全球第五大搜索引擎，俄罗斯市场占有率超过 60%。
即使不做俄语市场，Yandex 也是 IndexNow 的共同创建者——注册 Webmaster 能拿到收录状态和搜索分析数据，
而且 Yandex 对行为指标的权重远高于 Google（用户停留时长、跳出率、点击率都直接影响排名），
这些数据本身就有参考价值。

入口：`https://webmaster.yandex.com/`

自动化脚本：`scripts/yandex-setup.mjs`（`status` / `add-site` / `verify`），这是默认路径，
不要手工点后台——添加站点、选 DNS record 验证方式、把 TXT 记录写进 Cloudflare、点
Verify 全部由脚本完成，只有 DNS 传播这段等待需要人耐心：

```bash
# 查验证状态（只读）
node <rankup-skill-dir>/scripts/yandex-setup.mjs status --site https://example.com

# 添加站点 + 从页面 DOM 取 DNS TXT 验证值 + 自动写进 Cloudflare DNS
# （站点已存在、TXT 已存在都会被识别并跳过，不重复加）
node <rankup-skill-dir>/scripts/yandex-setup.mjs add-site --site https://example.com

# 可选：验证 pending 也能提交 sitemap，不用等两天，串起来一次做完
node <rankup-skill-dir>/scripts/yandex-setup.mjs add-site --site https://example.com --submit-sitemap

# DNS 传播到权威 NS 之后点 Verify
node <rankup-skill-dir>/scripts/yandex-setup.mjs verify --site https://example.com
```

**两个已实测的 UI 竞态坑（2026-09-13，两个真实站点上复现），脚本已经内置对策，
不需要人工干预**：

1. **Add 按钮首次点击常常不生效**——`fill` 已经把值写进了输入框，但第一次点击后
   页面停在原地。判据是点击后 URL 有没有变成该站点的 access 设置页，没变就对同一个
   目标重试，`--max-retries` 控制上限（默认 3）。
2. **Verify 按钮同理，但更隐蔽**：点击后**页面文案完全不变**，opencli 的 `click`
   本身永远返回成功——**唯一可靠判据是网络请求**：点击生效的那次会打一个
   `POST .../gate/verification/verify/` 并返回 2xx，不生效的那几次这个请求压根
   没发出去。脚本用 `opencli browser <s> network --since Ns` 判定，没命中就重试。

**边界事实：验证 pending 也能提交 sitemap。** 两个站点在 DNS 验证仍处于
「Check is in progress, it can take up to two days」的待定状态时，
`webmaster-sitemap.mjs yandex status/submit` 依然能正常访问 Indexing/Sitemap
页面并成功提交——**站点加入账号（哪怕验证 pending）就已经解锁这个功能，
不需要先等验证通过**，别被这条直觉带偏而白白拖慢流程。

#### 验证方式

与 Bing/GSC/Naver 同理，优先 HTML meta 标签：

```ts
{ name: "yandex-verification", content: YANDEX_VERIFICATION }
```

Yandex 也支持 HTML 文件上传（文件名格式 `yandex_<验证码>.html`，内容必须精确匹配模板，
不能有任何额外标签/CSS/JS）和 DNS TXT 记录（值格式 `yandex-verification: <验证码>`）。
选择逻辑与上面 GSC/Bing/Naver 一致。**WHOIS 验证已于 2025 年移除。**

注意：添加站点时必须填入精确的协议和子域（`https://` vs `http://`，`www` vs 非 `www`），
Yandex 把这些当作不同的资源。

#### 验证后要做的

1. **提交 sitemap**——在 Webmaster 后台「Indexing > Sitemap files」里提交。
   Yandex **只接受 XML 和 TXT 格式，不支持 RSS/Atom**。两周内处理完成。
   手动触发重新处理有次数限制（每个 host 10 次，之后等 30 天）。
   也可以在 `robots.txt` 里用 `Sitemap:` 指令声明。
2. **设置地区**——在「Site region settings」里设置站点的目标地区。
   Yandex 是城市级地域搜索引擎，约 30% 的查询结果因地区而异。
   设置后需要人工审核（几天到几周），不是即时生效。
3. **关联 Yandex Metrica**（可选但推荐）——Yandex Metrica 是免费的分析工具（类似 GA4），
   与 Webmaster 关联后可以加速收录。在 Webmaster 后台「Settings > Yandex Metrica tags」关联。
4. **查看「Site diagnostics」**——Yandex 有自己的一套诊断标准（缺失 meta 标签、HTTP 错误、
   重复内容、安全问题），与 Google Lighthouse 不完全重叠。
5. **检查 robots.txt**——用 Webmaster 后台的「Robots.txt analysis」工具验证规则是否正确。

#### Yandex 爬虫与 robots.txt

- **主爬虫 User-Agent**：`YandexBot`（完整字符串 `Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)`）
- robots.txt 里用 `User-agent: Yandex` 可以覆盖**全部** Yandex 机器人（图片、视频、广告等），
  而 `User-agent: YandexBot` 只针对主索引爬虫。
- **`Clean-param` 指令**（Yandex 独有）：告诉爬虫哪些 URL 参数不影响内容，避免重复抓取。
  格式：`Clean-param: utm_source&utm_medium&ref /`
- **`Crawl-delay` 已于 2018 年弃用**——改用 Webmaster 后台的抓取速率设置。
- 确认 `robots.txt` 没有误拦 `YandexBot`。

#### 注意事项

- **Yandex 账号注册无特殊限制**，用邮箱即可在 `passport.yandex.com` 注册。
- **Turbo Pages 已于 2025-04-01 停用**，不要再投入。
- **Yandex 对行为因素的权重极高**（2023 年源码泄漏确认权重 ~0.8），
  包括点击率、停留时长、跳出率、滚动深度、回访率。
  人为刷点击会触发「PF filter」惩罚——**绝对不做**。
- **商业查询有独立排名因子**：联系方式、法人信息、配送/支付/退货页面、
  产品卡片完整度、价格透明度。做电商站时参考。

### DuckDuckGo：无需额外操作

**DuckDuckGo 没有自己的站长工具，没有站点提交入口。**

DuckDuckGo 的搜索结果主要来自 Bing 索引，因此**提交 Bing Webmaster = 覆盖 DuckDuckGo**。
我们在步骤 3 已经做完了。

DuckDuckGo 有自己的爬虫 `DuckDuckBot`（User-Agent: `DuckDuckBot/1.1`），
用于补充特定功能和即时回答（Instant Answers）。
确保 `robots.txt` 没有误拦 `DuckDuckBot` 即可——不需要额外的验证或提交。

