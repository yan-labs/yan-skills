# 内容工具组（Content）板块索引

host：`sem.3ue.co`。14 条路由已于 2026-08-30 用双证人（`backlink/scripts/ground-truth.mjs`，
机器级 semrush 锁逐条持有，会话 `semrush-nav`）全部判决，判决书见
`backlink/SKILL.md` 的 `<semrush-content-audit-capabilities>` 块与本地
`backlink/evidence/ground-truth/semrush-content-audit-VERDICTS.md`（证据目录 gitignore）。

**本轮零消耗性写操作**：未建 SEO 项目、未建内容模板、未发布、未导出、未订阅。
唯二的点击是只读的。

## 一句话总账

**读层 3 条**（建了 PAGE.md）· **做层 7 条**（全部真付费墙，不建目录）·
**项目门空态 2 条**（转 `../site-audit/`）· **死路由 2 条**（不建目录）

## 读层：可采（各有 PAGE.md）

| 页面 | 路由 | 形状 | readyBranch | PAGE.md |
|---|---|---|---|---|
| 主题研究 · 入口 | `/topic-research/` | 表单 + 5 条历史列表 | **三分支全盲**，必须 `--ready-text` | **✅ `topic-research/PAGE.md`** |
| 主题研究 · 内容创意报表 | `/topic-research/<24hex>/` | **卡片**，10 张副主题卡 | `text`（`Volume:`，18.9s） | **✅ `topic-research-report/PAGE.md`** |
| SEO Writing Assistant · 文档列表 | `/swa/` | 卡片列表，10 份文档 | `text`（`质量分数为`，18.7s） | **✅ `swa/PAGE.md`** |

`/swa/` 是**读层（列表面）+ 做层（编辑器）**混合：列表页上既有稿子的评分与目标词可直接采，
「分析新文本」之后的编辑器是写稿/改稿，本项目用不到，未进入。

## 做层 7 条：**真付费墙，判死，不建目录**

Semrush 已把内容工具组整体重做成 **Content Toolkit，并从套餐里拆出来单卖（$60/月）**，
本账号**未买**。七条路由全部渲染英文营销落地页
（「Try it now for free」+「7-day free trial, then $60/month」+ 客户证言 + 产品截图插画）：

| 路由 | `document.title` | 落点 |
|---|---|---|
| `/content/` | Get Your Content Seen Everywhere \| Semrush Content Toolkit | `/content/?fid=…` |
| `/content/topic-finder/` | Semrush Content Toolkit: Rank High with AI and Data | `…?fid=…` |
| `/content/briefs/create/` | Semrush SEO Brief Generator: Create Briefs that Help You Rank | `…?fid=…` |
| `/content/articles/` | Get Your Content Seen Everywhere \| … Content Toolkit | `…?fid=…` |
| `/content/articles/create/` | Semrush AI Article Generator: Create SEO Articles 12x Faster | `…?fid=…` |
| `/content/articles/optimize/` | Semrush AI Search Optimizer: Improve Your Drafts in Minutes | `…?fid=…` |
| `/content/articles/repurpose/` | Get Your Content Seen Everywhere \| … Content Toolkit | `…?fid=…` |

- **判死理由：付费墙 + 做层，双重不可用**，无需深入操作。
- **这不是「假付费墙 = URL 编码错误」**（见 `../OVERVIEW.md` 平台坑表）：
  没有模糊弹窗、没有「升级到 Business」，URL 干净、落点正确，
  `fid=13245116&name=My+Folder` 是面板自己附加的文件夹上下文（与 `lid=` 同类）。
  **是真的没买这个订阅。**
- 一个本可以是读层的候补也被一并挡住：`/content/briefs/create/`（SEO Brief Generator，
  旧 SEO Content Template 的继任者）本质是「读」性质的 spec 生成器，同样被墙。
- `/content/board/new` 在导航里出现过但未单独采集（大概率同墙）。**未采 ≠ 不存在。**

## 死路由 2 条：**不建目录**

| 路由 | 落点 | 说明 |
|---|---|---|
| `/seo-content-template/` | **302 → `/swa/`** | 旧 SEO Content Template 已下线；官方替代品是付费的 SEO Brief Generator。复现须传 `--accept-redirect /swa/`，否则被落点自检判 hijack（exit 3） |
| `/log-file-analyzer/` | **302 → `/siteaudit/`** | 项目门工具，无项目即被弹回项目列表 |

## 项目门 2 条：转 `../site-audit/`

`/siteaudit/` 与 `/on-page-seo-checker/` 在**无项目**时只有空态或引导页。
勘测当天账号里 0 个 SEO 项目，之后建了一个（campaign `<CAMPAIGN_ID>`）——
现在的形状、建项目配方与报告路由全部在 **`../site-audit/OVERVIEW.md`**。
无项目时的原始形状（含 `/on-page-seo-checker/` 的促销插画坑）也留档在那份 OVERVIEW 里。

## 板块级坑

| 坑 | 表现 | 对策 |
|---|---|---|
| **`readyBranch=table` ≠ 有数据** | 七条落地页的「就绪 table」是**定价对比表**；`/siteaudit/` 无项目时 `filledCells=1`，那 1 格是**空态提示本身** | 就绪只保证画完了。有无数据必须再看 census 正文 + 截图 |
| **像素里的数字可能是促销插画** | `/on-page-seo-checker/` 截图有 `243 Total Ideas`、`Over 240%`，而 DOM 里 0 命中、`svgText=0` | **任何来自截图的数字都必须能在 census 全文里检索到**；检索不到 = 插画，不是数据 |
| **导航有条目 ≠ 功能可用** | 左侧导航完整列出 Content Toolkit 六个子工具（AI 文章生成器 / 内容优化工具 / 转换为社交媒体管理或电子邮件 / 主题查找器 / SEO 概要生成器 / 我的内容），七条路由全是付费墙 | 侧栏只证明「路由存在」；可用性只能由落点页面的双证人判 |
| **卡片/列表页型必须 `--ready-text`** | Topic Research 报表、SWA 文档列表：`tables=0 cells=0 svgText=0` | 否则必然跑满预算 `exit=2`，且极易被误记成「这页没数据」 |
| **`document.title` 跨页复用** | Topic Research 入口页与报表页 title 完全相同 | 落点判据只看 `finalHref` 的 path，绝不看 title |
| **`fid=` 会被面板自动附加** | `/content/*` 落点全带 `fid=…&name=…` | 与 `lid=` 同类，无需手传，但落点核对时要预期它出现 |

## 与 `backlink/references/semrush-feature-map.md` 的差异（待主线修订）

| 手册原文 | 实测（2026-08-30） |
|---|---|
| 第 5 节「内容营销（Content，**GURU 独占解锁**）」 | ❌ 已拆成 **Content Toolkit，$60/月单独订阅**，本账号未买 |
| Topic Research 入口 `/topic-research/` | ✅ 正确，且是本板块唯一可用的读层报表 |
| SEO Content Template 入口 `/seo-content-template/` | ❌ 死路由，302 → `/swa/` |
| SEO Writing Assistant `/swa/` | ✅ 正确，活的；列表面是读层 |
| ContentShake AI「可能按额度另计费」 | ✅ 方向对，已并入 Content Toolkit 订阅 |
| Marketing Calendar / Post Tracking / Brand Monitoring | ⬜ 左侧导航里没有入口，本轮未见（App Center 未探） |
| Log File Analyzer `/log-file-analyzer/` | ❌ 302 → `/siteaudit/` |
| On Page SEO Checker「项目内」 | ✅ 正确，无项目时只有引导页 + 促销插画 |

## 未竟事项

1. **Topic Research 的新查询直达 URL 未破**——见 `topic-research/PAGE.md`。
2. **Topic Research 另外 3 个视图未采**：资源管理器 / 概览 / 思维导图。
   按「桶参数不可信」纪律，**每个视图的直达参数须逐个实证**，不做同构迁移。
3. **卡片是否滚动分页未验**：10 张卡片是否为全部，本轮未测。
4. **App Center / Brand Monitoring / Marketing Calendar 未探**。
