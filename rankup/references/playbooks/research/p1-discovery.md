# 调研流水线 · P1 挖需求

新品候选可补跑 `node scripts/demand/new-launches.mjs --days 7 --sources taaft,toolify --snapshot-dir <dir> --compare --md --json`：
TAAFT 最新收录入口为 `/just-released/`，按根域统计多站同词与首次观察新增；[用法、覆盖限制与下一步](../../demand-sources/users-and-launches.md#新品快照与多站同词候选)。
候选先交 gpts 基线判读与 `entry.md` 入口环节，不据目录收录直接判断需求。


> 本文件从 [`research.md`](../research.md) 拆出（2026-09-30）。开跑前先读主文件的[四条铁律](../research.md#四条贯穿全部流水线的铁律)、[五个取数动作](../research.md#五个取数动作与编排探索循环)与[阶段 0](../research.md#阶段-0-开工前-30-秒每条流水线都以它开头)；路径变量 `$RANKUP` / `$BACKLINK` 见主文件「怎么用」。

## P1 · 挖需求 / 找方向 / 不知道做什么

### 触发

「不知道做什么」「找几个关键词」「挖点需求」「最近有什么能做的」「找个新方向」
「挖个新词的工具站」「有什么能做的方向」「找选题」「市场探测」「选品调研」

### 产出

| 落点 | 内容 |
|---|---|
| `.rankup/decisions.md` | 候选方向、用户任务、主词、来源与日期、背景观察、入口卡指针或待验证缺项；候选不是立项结论 |
| `.rankup/keywords.md` | 候选词或用户原话、国家/语种、来源与日期、验证状态；移交 P2 后关联问法簇与目标页 |
| `.rankup/checks.md` | 采集与移交的实际完成证据，未采集/失败/未验证分别记 |
| `.rankup/research/` 与证据目录 | 来源原始记录；验证后的 GT 卡、三清单、逐问法 Google 卡与结论引用入口卡，不在 P1 重写字段规则 |

### 流水线

来源分流只见 [demand-sources.md](../../demand-sources.md)；从候选站点提主词后转 P2，探索动作与工作量只见 [P2](p2-keyword-root.md#五个取数动作与编排探索循环)。

#### 第一小时最小可执行子集（面对 24 个脚本不要发呆，先跑这 6 个）

**公开源可直接跑；Stripe 官方分支需要 CLI 授权并按积分计费，全榜/新进筛选保留旧入口（本轮未重验）**，可以在**一条消息里派 6 个 sub agent 并行**。

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 1a | **并行 A** | `node $RANKUP/scripts/demand/stripe-referring.mjs top --m YYYYMM --new-only --limit 40 --json --out /tmp/r/stripe.json` | 本月**新进榜**的 Stripe 引荐域名 = 最强的「新机会」信号 | 新进筛选使用旧全榜入口（官方无等价、本轮未重验，原记录不计每日配额）；不指定月份另需官方 overview 1 积分。空了先核对 sources 状态与榜单月份 |
| 1b | **并行 A** | `node $RANKUP/scripts/demand/boards.mjs trustmrr --board growth --limit 40 --json --out /tmp/r/mrr.json`<br>`node $RANKUP/scripts/demand/boards.mjs traffic-cv --type traffic --tab new --json --out /tmp/r/tcv.json` | TrustMRR 是 **Stripe 实连**（唯一能当数字用的收入源）；traffic.cv 是定性信号 | 需真实浏览器过 CF 质询，不需登录。失败带 `--keep-open` 保住现场 |
| 1c | **并行 A** | `node $RANKUP/scripts/demand/boards.mjs taaft --board requests-top --pages 2 --json --out /tmp/r/wish.json` | 许愿区**按票数排**——真实需求信号最强的一档 | 同上，CF 质询 |
| 1d | **并行 A** | `node $RANKUP/scripts/demand/reddit-wishes.mjs --subreddit SaaS,startups,SideProject,Entrepreneur --time month --limit 40 --json --out /tmp/r/reddit.json` | 用户**原话**（可直接当页面标题用） | 没 token 会走 RSS，`--delay` 别低于 6000，否则 429 |
| 1e | **并行 A** | `node $RANKUP/scripts/demand/hn-signals.mjs --mode ask --days 14 --limit 40 --json --out /tmp/r/hn.json`<br>`node $RANKUP/scripts/demand/github-trending.mjs --since weekly --limit 30 --json --out /tmp/r/gh.json` | 痛点讨论 + 唯一公开的 star 增速信号 | HN 走 Algolia，稳；GitHub trending 是公开 HTML |
| 1f | **并行 A** | `/anysearch` → `python3 ~/.agents/skills/anysearch/scripts/anysearch_cli.py batch_search --query "site:turbo0.com new tools" --query "huggingface trending spaces this week" --query "indie hackers revenue milestone 2026" --max_results 10` | 覆盖 **capability-map「手工源」表**里 turbo0 / IndieHackers / HuggingFace Trending / Arena.ai 那几行——它们**没有脚本**，此前只能靠人 | 匿名可跑（已实测）；要更高频率再配 `ANYSEARCH_API_KEY` |

**合流（串行，主线做）**：

```bash
mkdir -p /tmp/r && cat /tmp/r/*.json | jq -r '..|.domain? // empty' | sort -u > /tmp/r/candidates.txt
wc -l /tmp/r/candidates.txt
```

#### 第二小时起：候选池 → 域名画像 → 主词移交

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 2 | 串行，按需官方 API | `node $RANKUP/scripts/demand/domain-profile.mjs --file /tmp/r/candidates.txt --out /tmp/r/profiles.jsonl --limit 60` | 注册日期、站龄、访问、渠道、DR、核心搜索词，均作候选背景 | CLI 报错记取数失败；已有 jsonl 行会跳过，包括失败行，补采前检查状态 |
| 3 | 串行，主线 | 合并同任务线索与真实措辞，记录用户范围及尚缺的输入 | 候选方向、任务与主词；有主词即可转 P2，不等画像数字过线 | 无主词按 P2 阶段 0.5 补输入，不用年龄、流量或收益淘汰 |

【历史实测归档，不承担现行筛选】通常 60 个域名剩 0–2 个（**实测命中率约 300:1**，剩 0 个是正常结果，不是失败）。这是旧阈值流程的观察，不是本轮成功率或数量线。

#### 第三段：候选补充画像 → 进 P2

主词出现即按 [entry.md](../entry.md#3--流水线)验证；下表 4–5 仅按需补候选背景，不能插入 GT 与首要采样之间充当筛子。

| 阶段 | 并行/串行 | 跑什么 | 拿到什么 | 卡住了怎么办 |
|---|---|---|---|---|
| 4 | 独立来源可并行 | `node $RANKUP/scripts/demand/sitemap-diff.mjs --domain <域名> --all --slug-words --top-words 40`；按需 `site-network.mjs --domain <域名> --confirm --max 10 --json` | 词族、目标页、同主体站点线索 | 站群空结果只记未找到；实测某组 10 个兄弟站没有一个共享指纹，绑住它们的是同一个 `utm_source` |
| 5 | 串行，独占面板，按需 | `similarweb-query.mjs --report performance`、`semrush-traffic.mjs` 核总访问；`semrush-overview.mjs --db <目标国>` 核单国家自然搜索（脚本在 `$BACKLINK/scripts/`） | 来源、日期与口径并列的访问/渠道背景 | 失败先读已有现场；总访问与单国家自然量不裸比 |
| 6 | 按 P2 顺序 | GT 测量仅引用 [trends.md](../../trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源) | 入口卡①指针 | 不在 P1 复制分批、锚点或新词例外 |
| 7 | 按需 | 记录已有收入来源、成本与开发复杂度，移交规划备注 | 有出处的经营观察或未知 | 不调用 KD 派生收益/预算模型来裁决 |
| 8 | 串行 | 主词交 [P2](p2-keyword-root.md#p2--词根调研这个词能不能做扩成树)，验证结果只按 entry | 入口卡、三清单、逐问法 Google 卡与结论指针 | 缺项保留待验证，不降低目标 |

### 判读

| 问题 | 唯一源 |
|---|---|
| 来源与背景口径 | [demand-sources.md](../../demand-sources.md)，收入/渠道观察不在 P1 改成立项票 |
| GT、校准、新词与失败 | [trends.md](../../trends.md#gpts-基线判读到底怎么才算有搜索量唯一判据源) |
| 多模型问法、ChatGPT 自然采样与三清单 | [seo-geo.md](../../seo-geo.md#步骤-2探针采样) |
| 每条长尾问法的 Google 读法 | [seo-serp.md](../../seo-serp.md#逐问法-google-读法) |
| 两路裁决、出局、未知与 KD | [entry.md](../entry.md#4--判读) |
| 探索、反查、补漏与工作量 | [P2](p2-keyword-root.md#五个取数动作与编排探索循环) |

### 省配额

| 档位 | 这条链路里的谁 | 代价 |
|---|---|---|
| **零配额，放开跑** | 1e hn-signals / github-trending · 1f anysearch · 4 sitemap-diff / site-network · GT 采集按 trends.md | 只花时间。**并行度只受机器限制** |
| **零配额但要真浏览器**（过反爬，不需登录） | 1b boards trustmrr/traffic-cv · 1c taaft · reviews-mine 的 trustpilot/g2/capterra · chrome-stats | 每个源一个**描述性会话名**，跑完 `opencli browser <session> close`。sub agent 退出前必须显式关 |
| **官方 API 积分** | 1a `stripe-referring` 官方分支每业务调用 1（全榜保留旧入口）；`payment-referrers serp` 每查询 2；其他接口按官方实时目录 | 阶段 0 查价格与余额，保留实际扣费字段；不沿用旧网站共享池或缓存免费口径 |
| **面板配额，一次一个采集器** | 5 similarweb-query / semrush-overview / semrush-report / similarweb-keywords | 会话名固定，**不许并行**。`similarweb-batch` 单域 6–10 秒，可续跑 |
| **要钱的** | `domain-profile.mjs` 默认官方 gefei CLI（domain_overview 当前 2 积分/域名，以目录为准）；`--provider tabapi` 按 credit · `serp-query`（serper 可选兜底，默认见 [SERP 取数路线](../../seo-serp.md#serp-取数路线)） | 官方 API 扣余额，不用网站每日赠送额度 |

### 收尾

- 候选表保留来源、日期、国家/语种与状态，主词移交 P2，已有验证结果只留入口卡指针。
- `decisions.md` 区分候选、待验证与已裁决路线；记录具体缺项，判读只按 entry。
- `checks.md` 记实际完成证据；完成验收只见 [checklists.md](../../checklists.md)，不复制旧必做数量线。
- 原始采集证据保留在 `.rankup/evidence/demand/`，不把失败记录当市场反证。

---

