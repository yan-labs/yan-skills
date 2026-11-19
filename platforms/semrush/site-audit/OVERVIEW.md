# Site Audit（网站检测）板块索引

host：`sem.proxy.example.com`。这是 Semrush 里**唯一没有无状态入口**的模块：
`/analytics/*` 系用 `?q=<域名>` 就能查任意站，Site Audit 的每条路由都绑一个**项目 id**，
没有项目就没有报告。5 条报告路由已于 2026-08-30 用双证人
（`backlink/scripts/ground-truth.mjs`，机器级 semrush 锁逐轮持有，会话 `semrush-nav`）判决，
判决书见 `backlink/SKILL.md` 的 `<semrush-siteaudit-capabilities>` 块与本地
`backlink/evidence/ground-truth/semrush-siteaudit-VERDICTS.md`（证据目录 gitignore）。

## URL 模板

```
https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/<route>
```

- `<CAMPAIGN_ID>` 只能**建完项目后从地址栏读回**：列表行是 DIV、`href=null`、
  类名是 hash 化的 CSS module，拿不到链接。任何脚本都要把它参数化。
- 使用自己的 campaign ID。

## 已判决路由

| 页面 | 路由 | 形状 | readyBranch | 推荐 `--ready-text` | PAGE.md |
|---|---|---|---|---|---|
| 概览 | `review/overview` | 卡片 + 仪表盘 + 小表格 | `table`（filledCells=15） | 不需要 | **✅ `overview/PAGE.md`** |
| 问题清单 | `review/issues` | **DIV 卡片列表** | **`text`** | `如何解决` | **✅ `issues/PAGE.md`** |
| 已抓取页面 | `review/pagereport` | 真表格 | `table`（filledCells=608） | 不需要 | **✅ `pagereport/PAGE.md`** |
| 网页可爬性 | `review/crawlability` | 卡片 + 图表仪表盘 | 名义 `table`（filledCells=**1**，侥幸） | `分数：`（建议显式加） | **✅ `crawlability/PAGE.md`** |
| HTTPS | `review/https` | 11 张检查卡 | **`text`** | `分数：` | **✅ `https/PAGE.md`** |

**已知但未勘测的 tab**：`统计数据`、`比较抓取结果`、`进展`、`JS 影响`、
`已抓取页面 > 站点架构`；以及 issues 的**下钻层**（点具体问题进详情页，
是把体检结论变成可执行清单的关键一跳）。**未勘测 ≠ 不存在**，别写成「没有」。

## 建项目配方（消耗性操作，读完再动）

⚠️ **一个账号 Projects 名额只有 15 个，本轮已占 1 个。**
再勘测请复用 campaign `<CAMPAIGN_ID>`，**不要新建第二个项目**。下面这份配方记录一次即可，
存在的意义是「下次真需要建时不用重新摸」，不是「可以随便跑」。

### 全景：**两段式，不是一个多步向导**

| 段 | 对话框 | 触发 | 出现时机 |
|---|---|---|---|
| 第 1 段 | **创建 SEO 项目**（2 个输入框） | `/siteaudit/` 列表页按钮「创建 SEO 项目」 | 立刻 |
| 第 2 段 | **新检测**（5 步向导） | 第 1 段提交成功后**自动弹出**；也可事后点项目行「设置」重开 | 提交后约 1–2 秒 |

> **头号坑：第 1 段提交后，第 1 段的对话框不会消失。**
> 两个 dialog 同时挂在 DOM 上（证据 `create/wizard-log.json` 的 `13-submitted`，
> `dialogs` 数组长度 = 2）。按「当前唯一 dialog」定位元素的写法会打到**旧框**上。
> **永远取 `dialogs` 数组的最后一个。**

### 第 1 段字段

| 字段 | 选择器 | 值 |
|---|---|---|
| 域名 | `input#cpmProjectDomain`（placeholder `domain.com`） | 目标域名 |
| 姓名（可选） | `input#cpmProjectName`（「若留空则自动生成」） | 可留空 |
| 提交 | **按可见文本**点按钮 `创建 SEO 项目` | — |

- 提示文案「输入域名或子域名。**不支持子文件夹**」——传 `example.com/blog/` 会被拒。
- 填值用 opencli 的受控 set-value（断言 `action.ok:true` 并回读 `value`），
  **不要模拟逐字键入**。按钮列表里混着若干 `text: ""` 的图标按钮，按文本匹配天然避开。

### 第 2 段：「新检测」5 步向导

步骤条固定 5 步，后 4 步全部标「可选」：
`1 常规` / `2 抓取器（可选）` / `3 允许-禁止规则（可选）` / `4 URL 参数规则（可选）` /
`5 绕过的限制（可选）`；提交按钮文本 `开始检测`。

**会静默塑形报告的默认值（实测）：**

| 项 | 默认 | 后果 |
|---|---|---|
| 每次检测的限额 | **100 个页面** | 报告里的「已抓取页面 N/100」由它决定 |
| 抓取源 | `网站`（从主页顺内链爬） | — |
| 用户代理 | `SiteAuditBot (Mobile)` | 报告头显示「移动设备」 |
| 抓取延迟 | radio value=`1`「最短」 | — |
| **JS 渲染** | **checkbox 不勾 = 关** | 报告头「JS 渲染：已禁用」。⚠️ 对 SPA / 前端渲染站，这会让内容类指标（单词数量、text-HTML 比率）**系统性偏低**——看到这两条警告先重跑一次并打开 JS 渲染再下结论 |
| 完成邮件 | 勾选 | — |
| 步骤 5 三个开关 | 全关 | 绕过 robots.txt / 用我的凭证抓取 / Web Bot Auth 签名 |

**排期下拉有「一次」选项**，实测全集：`每周，每周一 … 每周，每周日 / 每日 / 一次`。
本轮的选择器实现没识别出来，**保留了默认周更 → 项目会每周自动重跑**。
一次性勘测必须在步骤 1 显式选「一次」。

> **第二个坑：排期下拉的当前值文案随当天星期变化**（同一份证据里先后出现
> 「每周一」「每周五」「每周六」）。按写死的星期文本定位排期按钮必炸；
> 应按「排期」标签的**兄弟按钮**定位。

> 截图档案：`assets/create-dialog.png`（第 1 段对话框）、`assets/wizard-step1.png`
> （第 2 段向导步骤 1「常规」）。截图不入公开仓库（`.gitignore` 覆盖 `platforms/**/assets/`），
> clean checkout 里链接会断，属预期——文字描述必须自足。

### 启动与等待

点 `开始检测` → 向导关闭，列表行立刻变「正在检测站点…… 1 /100」。
本轮 88 页耗时约 **13 分钟**。抓完再采报告页。

## 板块级坑

| 坑 | 表现 | 对策 |
|---|---|---|
| **卡片/列表页型双零盲区** | `issues`/`https` 的 `filledCells=0` 且 `svgText=0`，table 与 chart 分支都不接 → 烧满预算 `stopReason=budget` | **exit 2 不等于没数据**。判死前先 grep 最后一份 census 的 `deepText`；命中业务词就改用 `--ready-text` 重采。详见 `backlink/SKILL.md` 的 `every-measurement-needs-two-witnesses` |
| **`--ready-text` 别写死空格** | 前一轮用 `错误 \(\d+\)` 连烧 200 秒——页面里是「错误」+**换行**+「(1)」 | 中文标签与数字之间常是 `\n`；**首选单个稳定词**（`如何解决`、`分数：`）。别用只在左栏导航出现的词（`网站检测`、`概览`），外壳一加载就命中等于没判据 |
| **导航瞬时失败伪装成 hijack** | `hijacked=true` + `finalHref=/` + `deepTextLength` 只有 88（白屏） | **处置是重试，不是加 `--accept-redirect`**。`/` 不是任何路由的合法别名，放行它等于把空白页当数据采回来。真正需要 `--accept-redirect` 的只有 `pagereport`（→ `/pagereport/pages`） |
| **`deep.textLength` ≈ 1,599,xxx 是外壳常数** | 每条路由都在 159.9 万上下，差几十字符 | **对「有没有数据」零信息量**；只能用来判白屏（白屏那次只有 88） |
| **`deepText` 截断在 ~20,000 字符** | 本轮所有 census 的 `deepText` 长度都恰好 20,034 | 行数一多必然吃截断。**大表格别拿 `deepText` 数行数**，按 `filledCells` 计数或按分页拆 |
| **`filledCells` 可能是侥幸** | `crawlability` 只有 1 个孤立单元格，恰好让它走进 table 分支 | 别指望它；显式加 `--ready-text "分数："` |
| **`readyBranch` 不是数据判决** | `/siteaudit/`（无项目时）也能 `table` 就绪，那唯一 1 格是空态提示本身 | 就绪只保证画完了；有无数据要看 census 正文 + 截图 |
| **`max-screens` 不是「到底」** | pagereport 前一轮以 `max-screens` 收尾，只是**截图覆盖**不全，census 一直是全量的 | 判「到底」看 `scrollY + innerHeight` 有没有覆盖 `bodyScrollHeight` |
| **项目行拿不到 id** | 列表行是 DIV，`href=null` | 点进去从 URL 读 |

## 无项目时的三条路由（留档，别重跑）

在建项目**之前**，这三条路由 2026-08-30 实测的形状：

- `/siteaudit/` —— 表格**空态**，12 列头齐全（项目 / 上次更新 / 已抓取页面 / 网站健康分数 /
  AI 搜索健康 / 错误 / 警告 / 网页可爬性 / HTTPS / 内部 SEO / 站点表现 / 内部链接），
  数据行 0，正文「未找到任何数据」。只读点「显示所有项目」后 census 与截图双双不变
  → 确认是 0 个项目，不是筛选器造成的假空。
- `/on-page-seo-checker/` —— **引导页**，三条就绪分支全不成立（`budget/exit 2`）。
  ⚠️ 截图里那张写着 `243 Total Ideas`、`Over 240%`、`Current 300K → Potential 720K` 的
  甜甜圈图是**光栅促销插画**：census 全文检索 `243` / `Total Ideas` 全部落空、`svgText=0`。
  只看截图会把促销插画当成本账号的真实报告数据抄走。
- `/log-file-analyzer/` —— **死路由**，302 → `/siteaudit/`（项目门工具）。

## 纪律

- 配额纪律、假付费墙、壳先到货后到等平台级坑见 `../OVERVIEW.md`。
- **「导出 / PDF / Looker Studio」按钮存在但按纪律不碰**；不订阅、不改项目设置。
- 报告里出现的具体体检数字属于**某个站的当次结果**，不写进本手册——
  手册只记「这页有什么数据、怎么采」。
