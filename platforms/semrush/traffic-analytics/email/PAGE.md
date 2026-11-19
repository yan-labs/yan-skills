# Traffic Analytics · Email（电子邮件）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/email/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题/左侧导航「电子邮件」高亮；维度：全球 / 月份 / 每月 / 所有设备

## 回答什么业务问题

竞品邮件渠道带来多少流量。**判决修正（2026-08-30）：本页不是恒空态。**
2026-08-29 对 canva.com 实测为空（svgText=0，双证人），2026-08-30 **同一个域**
渲染出真图（svgText=31）——上轮「真空态」判决**降级为「时变/水合相关」**。
这页手册的价值有二：无文案空态的判别法，以及「稳定空一轮 ≠ 路由恒空」的教训。

## 数据清单

**有图轮**（canva.com，2026-08-30 实测，svgText=31）：

1. 流量趋势 / 桌面设备趋势 / 移动设备趋势 三图，坐标轴 0–1000万；
   「增长最快的页面」洞察卡。解读方式与 `referral/PAGE.md` 同构。

**空态轮**（canva.com，2026-08-29 实测，svgText=0）：

1. 页面骨架同样四个区块标题（流量趋势 / 桌面 / 移动 / 增长最快的页面），每块带「导出」。
2. 区块内容全部是**灰色锯齿占位图**：无坐标轴、无刻度、无数据点；「导出」按钮置灰。
3. deepText 里找不到任何 万/亿 数字；**占位图不带「暂无数据」之类文案**。

## 形状与就绪

- 形状：**时变——chart-only 或 empty-state**，同域两轮实测两个形态都出现过。
- 判别子仍是 census 的 **svgText**：>0 三轮稳定按 chart-only 解读；恒 0 判「本轮空」。
  - **标记法失效**：占位图没有任何「无数据」文案，detectEmptyState 不触发——
    别等文案，认 svgText。
  - **但 svgText=0 的判决半径缩小了**：2026-08-29 那轮 2 次刷新 + 30 轮轮询恒 0，
    当时判「稳定空态」；次日同域有图。**一轮稳定 0 只能判「本轮无图」，
    判不了「该域/该路由无邮件数据」**——空态可能是时变的或水合失败。
- ground-truth.mjs 会在 manifest 标 `suspectedEmptyState: true`；**判决仍归 AI**——
  双证人合验，且负面判决要注明「本轮」，隔日复测后才可加重。

## 怎么采

```sh
platforms/semrush/traffic-analytics/email/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`。
换别的域名采集时：若 svgText>0 且三轮稳定，说明该域有邮件流量图，按 chart-only
路由（参照 `referral/PAGE.md`）解读；若 svgText 恒 0 且截图是灰色锯齿，判空态。

## 已知坑

| 坑 | 细节 |
|---|---|
| **空态没有文案** | 无「暂无数据」字样，任何基于文案标记的空态检测都不触发；判别子是 svgText |
| **稳定空一轮 ≠ 恒空** | 2026-08-29 恒 0 判空，2026-08-30 同域 svgText=31 有图——空态判决只覆盖本轮，加重结论必须隔日复测 |
| 别把空态当加载中 | 灰色锯齿 + 刷新/轮询后恒定不变 = 本轮稳定空态；反之落点正确但恒空白也可能是卡加载（参照 page-groups 的 v1 事故），双证人 + 多轮稳定才可判 |
| 别把空态当「功能不存在」 | 历史判决把本页与 8 条有数据的 chart 路由混为一类记成「无数据」——功能存在、页面存在，空只是本轮/本域的渲染态 |
| **`q=` 被 `lid` 覆盖** | `?q=nytimes.com` 落点 href 带着 q，报表头与数据却仍是 canva.com（未命名列表域）——整个 Traffic Analytics 树同病；换域先换列表，详见 `../OVERVIEW.md` |
| 「导出」置灰是佐证不是判据 | 置灰状态在截图里可见，但 DOM 判别以 svgText=0 为准 |
| 壳文本照样齐 | 空态页深层壳文本同样 ~1.6M 字符——文本长度判据在空态页也会误判「有货」 |
| 共享标签页会被抢 | 会话 `semrush-nav` 共享标签页；判决前核对每轮 href |

## 验证记录

- **2026-08-29**（UTC 07:34–07:38）双证人重测，canva.com，会话 `semrush-nav`。
  退出码 2（budget），30 轮 poll，refreshCount=2。
  filledCells=0；deep.tables 0 / deep.grids 0 / **svgText 0**（与其他 chart-only
  路由的 43–49 截然不同）。截图落点正确（「电子邮件」高亮、canva.com）：三张卡片
  全是灰色锯齿占位、无坐标轴、无数据点、「导出」置灰；deepText 无任何 万/亿 数字。
  双证人一致：像素与 DOM 互相印证。
  裁决：**empty-state**（canva.com 的电子邮件渠道无可展示数值；经 2 次刷新 +
  30 轮轮询恒定，排除加载中）。历史把它与有图路由归为一类是错的——它连图都没有。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/remeasure-email/`，
  判决书 `backlink/evidence/ground-truth/remeasure-VERDICTS.md`。
- **2026-08-30**（round4）换域验证轮：`?q=nytimes.com` 开本页，落点仍渲染 canva.com
  （lid 覆盖 q 的实锤），且 canva 的 email 本轮 **svgText=31 有真图**（三趋势图轴
  0–1000万 + 增长最快页面卡）——上轮真空态判决就此**降级为时变**。
  证据：`…/semrush-round4-email-nytimes/`；判决书 `…/semrush-round4-VERDICTS.md` 页卡 7。
- 截图档案：`assets/empty.png`（空态轮的样子）、
  `assets/nonempty-canva-2026-08-30.png`（同域有图轮的样子）。
