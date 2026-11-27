# 纪律六：数据面板先查能力表（全文）

> 入口在 [`discipline.md`](../discipline.md) 六，那里只留一句规则；本文件是全文（2026-11-27 从 discipline.md 拆出）。

「这个面板能不能拿到 X」的答案已经写在 [`provider-capabilities.md`](../provider-capabilities.md)——
用真实登录态点出来的测绘表。**先查表，不要现开浏览器翻一遍。** 脚本缺口与优先级在 [`provider-script-gaps.md`](../provider-script-gaps.md)。

四条最省事的结论：

1. **两家的 API 和 MCP 全是死路，别再试。** 共享账号代理出借的是会话不是账号；API key 和 OAuth 同意页住在账号设置区。浏览器抓取不是临时替代方案，它是这个账号形态下唯一正确的方案。
2. Semrush 有 49 个页面是「做」层（写文章、发帖、建项目），本项目一个都不用；规划取数覆盖率时不要把它们算进分母。
3. **页面卡在「一直加载」时主动刷新重试**（刷 2–3 次才判 `unavailable`）。绝对不要把「卡加载」写成「功能不存在」或「零流量」——静默错数是这里最贵的错误。
4. 上一版审计报的 4 个「功能缺失」有 3 个是误报。判「缺失」前必须走三步：搜界面名 → 试旧路径看跳转 → 查更新日志。

### 会话名：配额站不传 `--session`

Semrush / Similarweb 的脚本**收敛到固定会话名**（`semrush-nav` / `similarweb-nav`），**不要传 `--session`，
也不要每个 agent 一个会话名**。它们是配额站：会话名就是并发度，固定名让 daemon 把并发排成一队；
传了会被忽略并打一行 stderr。Ahrefs 同理，固定 `ahrefs-nav`。旧版主文件的 Rankup CLI 示例带着 `--session`，已改正：

```bash
npx --package $RANKUP_PACKAGE rankup catalog semrush --modules      # 展开工具箱 → 功能页树
npx --package $RANKUP_PACKAGE rankup catalog --gaps                 # 只看两家没摸到的地方
npx --package $RANKUP_PACKAGE rankup capture semrush keyword-overview --keyword "<词>" --db us --out-dir .rankup/provider-audit/keyword-us
npx --package $RANKUP_PACKAGE rankup audit similarweb --manifest .rankup/provider-audit/similarweb.json --out-dir .rankup/provider-audit/live/similarweb --resume
```

- 同一平台首页最多用于首次启动一次；进入工具域名后走内页，不要每项报告重新经过首页。
- `audit` 的 manifest 既是页面目录也是续跑入口；每页证据固定八件（page.txt / page.html / DOM / AX / parsed / app JSON / network shape / 全页截图）外加带 SHA-256 的 `receipt.json`。截图不做遮罩；只有 Cookie、登录令牌这类可直接接管账号的凭据不落盘。
- 国家数据库不能只看默认美国：先看 global/country distribution，主要需求在别国时切到该国家库复核；抓取失败或权限不足不能写成零需求。
- 更通用的一条：**脚本的国家/地区/语言参数默认值不代表全球**。能选全球的平台（Google Trends 的 `geo` 留空、Similarweb 关键词生成器的 `country=999` Worldwide）默认就该给全球；不能选全球的平台（Google 网页搜索、App Store、Google Play、Chrome Web Store、广告透明度中心……）本来就要按国家/语言查，这层默认无法消除，但脚本的产出记录必须把这次用的国家/语言写清楚，不能只留在请求 URL 里，事后要能从产出文件本身查出当时的口径。文档示例命令里出现的 `us`/`en` 只是占位，不代表"默认就该这样"或"标准做法"——换目标市场前自己想清楚要传什么。

### 两家「流量」口径不同，对不上要查清原因

对齐三样东西——**地理范围 / 面板页面 / 口径定义**——方法在 [`experiences/webcafe-experiences.md`](../experiences/webcafe-experiences.md)
「对齐口径要对齐三样东西」与「两个数分别是什么」两节（含 `byCountry` 只有 Top-N 不能求和）。
本 Skill 自己的实测判据：**Semrush 的自然流量在单个大头词以第 5–10 位撑起过半模型流量时会高估 4–13 倍**，
拿到域名自然流量后先拉排名词分布再决定信不信总数（[`demand-sources/validation-chain.md`](../demand-sources/validation-chain.md#②六四-semrush-的自然流量什么时候不能信先看它的词库分布再决定信不信总数) [②·六·四](../demand-sources/validation-chain.md#②六四-semrush-的自然流量什么时候不能信先看它的词库分布再决定信不信总数)）。
三样都对齐了还差几倍才是真矛盾；对不上先怀疑口径，不要先怀疑数据源坏了。
