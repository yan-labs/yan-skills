# Advertising Research · 排名（adwords positions）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/adwords/positions/?db=us&q=<domain>&searchType=domain`
  - `q`：目标域名（如 `canva.com`）；`searchType`：固定 `domain`
  - `db`：数据库（`us`）。落地后 db 被吃进 UI 的「数据库: 美国」选择器，页内 href 不再保留 db
  - 面板可能自动附加 `__gmitm=`（剥敏，只留键名），不需要手动传
- 顶部 tab：排名 / 排名变化 / 竞争对手 / 广告创意 / 页面 / 子域名（organic 四件套的付费版）
- **未知 adwords 子路径统一 302 回本页**（adshistory/adhistory 均已实测回落）——
  本页是广告组的兜底落点，hijack 自检时要留意

## 回答什么业务问题

竞品用真金白银投的 Google Ads 词 = 已验证商业意图词。反哺自然选词：竞品肯长期付费的词，
商业价值经过了对方的钱包验证。

## 数据清单（canva.com，db=us，2026-08）

1. **三摘要卡**：关键词 2.6K（-38.3%）/ 流量 70.7K（-29.6%）/ 流量成本 US$94.4K（-26.9%）。
2. **付费搜索趋势图**：时间档 1月 / 6月 / 1年 / 2年 / 全部。
3. **主表** 15/17 列：广告标记、关键词、排名、位差、版块、搜索量、CPC、URL、流量、流量%、
   成本、成本%、竞争程度、结果、趋势。
4. **分页**：100 行/页 × 27 页，总量 **2,607 个付费词**；单屏 census 1,701 cells。
5. 行样例：capcut desktop 排名 3→3 · 搜索量 14,800 · CPC 1.08；digital scrapbooking
   2,900 · 1.47；birthday invite template 2,900 · 0.50。

## 形状与就绪

- 形状：**table**（readyBranch=table），就绪判据 `filledCells > 0`。
- 实测 31 秒就绪（含 2 次 stall-refresh；卡壳刷新是常规操作，不是异常）。
- 壳文本先齐、数据后落——文本长度判据会误判，只认 filledCells（全平台通例）。

## 怎么采

```sh
platforms/semrush/advertising-research/positions/collect.sh [domain] [db]
# 例：collect.sh figma.com us
# 默认 canva.com us；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`（照 top-pages 配方）：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 表头词重复两遍 | columnheader innerText 形如「关键词 关键词」（无障碍副本），解析先去重 |
| 截图漏列 | 一屏只见约 7 列，CPC 之后的列在水平滚动区外；只靠截图严重漏读 |
| db 参数隐身 | 落地后 href 不保留 `db=`，别据此以为参数没生效——看 UI 的「数据库」选择器 |
| referrer eval 会炸 | gmitm 镜像补丁换掉了 `document.referrer` getter，referrer 为空时读它抛 `charAt` 错——页内 eval 必须 try/catch |
| 兜底落点 | 未知 adwords 子路径 302 回本页；采别的 tab 前先确认 URL 没被回落 |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`，整轮持机器级 semrush 锁，canva.com。
  抽查 capcut desktop 3→3 14,800 1.08 / digital scrapbooking 2,900 1.47 /
  birthday invite template 2,900 0.50 / 总数 2,607 —— 像素↔DOM **全 HIT**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-adwords-positions/`；
  判决书 `…/semrush-ads-trends-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（摘要卡 + 趋势图 + 主表首屏）。
