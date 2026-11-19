# Site Audit · 概览（review/overview）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/overview`
  - `<CAMPAIGN_ID>`：项目 id，**没有按域名查的无状态入口**
  - 面板会附加 `__gmitm=`（剥敏，只留键名），不需要手传
- 落点：**原样**，不重定向
- 上级：`../OVERVIEW.md`（建项目配方、板块坑）

## 回答什么业务问题

一屏看完「这个站体检的总分和大头问题在哪」：网站健康分、抓取页面构成、
AI 搜索健康、Top 问题清单、7 项主题得分。要具体是哪些页、哪些字段，往 `../issues/`
和 `../pagereport/` 下钻。

## 数据清单

1. **网站健康分数**仪表盘（中央大数字，带「排名前 10% 的网站 = N%」对照基准）。
2. **已抓取页面分布**：正常 / 有问题 / 重定向 / 受阻 / 失效 五类计数。
3. **AI 搜索健康（beta）**：主流 AI 爬虫（ChatGPT-User / OAI-SearchBot / Googlebot /
   Google-Extended 等）是否放行。
4. **错误 / 警告 / 通知**三档计数。
5. **Top 问题清单**：按严重度排的若干条，每条带影响页数，可点进 issues 详情。
6. **7 项主题得分（Thematic Score）**：HTTPS、效果（Performance）、内部链接、标记（Markup）、
   网页可爬性、核心网页指标、国际 SEO。
   - ⚠️ **「核心网页指标 0%」通常不是真的差**，而是没接 Google Search Console / CrUX
     数据源——这项依赖外部真实用户数据，未授权时显示 0%。**不要按 0% 去做性能优化。**
   - 「国际 SEO：未实施」在单语站上是正常的。
7. 报告头标注本次抓取配置：设备（移动 / 桌面）、**JS 渲染是否启用**、抓取日期。

## 形状与就绪

- 形状：**卡片 + 仪表盘 + 小表格**混合。`readyBranch=table`，`filledCells=15`，
  `stopReason=stable`，3 步到底，readyAfterMs 约 13.4 秒。
- **仪表盘数字在 SVG 外的 DIV 里**，`svgText` 只有 4——**靠 chart 分支判就绪会失手**，
  本页恰好有 15 个 cell 才走通 table 分支。
- `deep.textLength` ≈ 1,599,xxx 是 Site Audit 全模块的外壳常数，对判就绪零信息量。

## 怎么采

```sh
platforms/semrush/site-audit/overview/collect.sh [campaign-id] [out-dir]
# 传入 campaign ID，或设置 SEMRUSH_CAMPAIGN_ID
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 180`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
**采完由 AI 对质双证人出结论，脚本不判决。**

## 已知坑

| 坑 | 细节 |
|---|---|
| chart 分支判不了就绪 | 仪表盘读数在 DIV 里，`svgText=4`；本页靠 table 分支的 15 格侥幸通过，换个版本就可能双零 |
| 核心网页指标 0% 是缺数据源 | 与之并列的「效果」可能是 100%；两者口径不同，别当成矛盾 |
| 报告头的 JS 渲染状态决定内容类指标 | 关着 JS 渲染时，SPA 站的「单词数量少 / text-HTML 比率低」大概率是假阳性 |
| 数字属于「某个站的当次结果」 | 手册不留具体分数，需要就现采 |

## 验证记录

- **2026-08-30**（周日，抓取完成 23:23）双证人采集，campaign `<CAMPAIGN_ID>`，会话 `semrush-nav`。
  census 的 deepText 与 `shot-s1.png` 中央仪表盘读数逐项对质一致。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-siteaudit-example/route-overview/`；
  判决书 `…/semrush-siteaudit-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（渲染完成的首屏）。
