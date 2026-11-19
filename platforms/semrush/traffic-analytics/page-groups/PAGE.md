# Traffic Analytics · Page Groups（页面组 beta）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/page-groups/?q=<domain>&searchType=domain`
  - `q`：目标域名；`searchType`：固定 `domain`
  - 面板可能自动附加 `lid=` 与 `__gmitm=`（剥敏，只留键名）——都不需要手动传
- `document.title`：`Dashboards`（不反映页面内容，别拿它当落点判据）
- 页面标题「页面组」，带 **beta** 徽标；域名选择器显示「canva.com (入口页面)」；
  维度：全球 / 月份 / 每月 / 所有设备

## 回答什么业务问题

竞品站点整体健康面板 + 哪些页面在暴涨——月访问/唯一/转化率/时长/跳出率的
汇总卡、增长最快的页面卡片、流量渠道构成。快速摸一个域名的「体检报告」从这页进。

## 数据清单

1. **汇总指标卡**（filledCells=20 主要来自这块的指标网格）：访问量 7.9亿 ↑4.53%
   （桌面 84.26% / 移动 15.74%）、唯一身份访问量 2.1亿 ↑2.92%、购买转化率 0.21% ↑28.17%、
   页数/访问 1（无变化）、平均访问时长 11:13 ↑8.03%、跳出率 31.38% ↑1.41%。
2. **趋势图**（趋势依据：设备/指标切换，y 轴 0–10亿，2026年2月–2026年7月）。
3. **增长最快的页面**卡片区：涨幅 + 截断 URL + 数值，如 46.9万%（9379 和 2）
   `canva.com/th_th/photos/s/nature`、33.7万% `canva.com/vi_vn/policies/privacy-policy`。
   卡片同时含截断和完整 URL 两份文本。
4. **流量渠道构成**（类型切换 + 堆叠趋势 0–8亿）：直接 79.32% 6.3亿、AI 流量 0.71%
   563.1万、引荐 5.25% 4168.9万、自然搜索 12.29% 9757.6万、谷歌 AI Mode 等。

## 形状与就绪

- 形状：**table**（manifest `readyBranch=table`，指标网格计为 grid），
  就绪判据：**filledCells > 0**（本页满值 20）。
- 实测时间线（2026-08-29 v3）：**就绪 35.2 秒**，5 轮 poll，refreshCount=1，stopReason=stable。
- **坑警报**：v1 那次 readyBranch=chart 提前判就绪、拿到的是空白内容区——
  本页 20 格很少，svgText 先于表格出现时 chart 分支可能抢跑。判「就绪」认 filledCells=20。

## 怎么采

```sh
platforms/semrush/traffic-analytics/page-groups/collect.sh [domain] [out-dir]
# 默认 domain=canva.com；证据落 backlink/evidence/ground-truth/ 下带时间戳目录
```

内部是一条 `node backlink/scripts/ground-truth.mjs --url … --out … --budget 240`：
自动持机器级 semrush 锁、会话 `semrush-nav`、轮询→成对截图+census→manifest。
采完由 AI 对质双证人出结论（脚本不判决），配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **三次运行才拿到有效证人对（实测）** | v1 卡加载态（落点对但内容全空白，0 cells）；v2 被外部导航接管，采到的 942 cells 属 sylviejewelry.com；v3 也只有 s1 一对有效，s2 起又被 keywordoverview 抢走。**本页是标签页劫持重灾区** |
| 别人的 cells 会冒充数据 | filledCells>0 不等于是目标域的数据——v2 的 942 格全属别的域名。判决前逐轮核对 href 和截图里的域名选择器 |
| chart 分支会抢跑 | 本页表格只有 20 格且图多，svgText 稳定可能早于 cells 落地；readyBranch=chart 的结果要人工复核 |
| 卡加载态存在 | 落点正确 + 内容区全空白是一种真实状态，刷新重试，别记成「功能不存在」 |
| beta 徽标 | 功能是 beta，界面结构可能变动，采集失败先截图对比本页数据清单 |
| URL 双份文本 | 增长页卡片同时有截断 URL 和完整 URL，解析去重 |

## 验证记录

- **2026-08-29**（UTC 08:28–08:29，recheck-page-groups-v3 第三次运行）双证人复核，
  canva.com，会话 `semrush-nav`。退出码 0（stable，readyBranch=table），就绪 35.2s，
  refreshCount=1。filledCells=20 与历史 20 **精确一致**；抽查 访问量 7.9亿、跳出率 31.38%、
  平均访问时长 11:13 均在 census-s1 命中，7.9 亿正是 canva 月访问基准值。
  **仅 s1 证人对有效**（同一停留位、同在 /analytics/traffic/page-groups/），
  s2 起标签页被抢；证据窗口窄但双证人同位一致。裁决：**confirmed-data**。
  v1/v2 目录仅作事故存证。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/recheck-page-groups-v3/`
  （含 v1、v2 事故目录），判决书 `backlink/evidence/ground-truth/recheck-VERDICTS.md`。
- 截图档案：`assets/loaded.png`（「页面组 beta」+ 汇总卡 + 增长页卡片）。
