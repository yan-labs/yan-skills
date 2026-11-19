# AI Traffic · 概览

## 页面身份

- URL 模板（**以落地 href 为准**）：
  ```
  https://sim.proxy.example.com/#/digitalsuite/ai-traffic/overview/*/999/6m?webSource=Total&key=<域名>
  ```
  - **路径段保持字面量 `*`**，域名只走 `key=`——这是本站「站点上下文冷深链必须带 `&key=`」
    定律的又一个实例。
  - `999` = 全球，`6m` = 近 6 个月，`webSource=Total`。
  - 落地 hash 与请求完全一致，**无漂移、无改写**（这条路由少见地不被面板改 URL）。
- `location.pathname` 恒为 `/`，一切路由信息在 `#/…` 里；落点自检比对 hash 前 3 段。
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

「谁在吃 AI 引荐流量、AI 把流量送到我（或竞品）的哪些页面」。
落地页表按 **URL 粒度**给出每个 AI 平台的占比——对 AI SEO / AEO 选题是硬证据，
比 Semrush 域名概览里那一列「AI 流量」细得多。

## 数据清单

1. **顶部卡**：`总流量`（绝对值）+ `N% 的总流量占比`（AI 引荐占全站流量的比例，带环比箭头）。
2. **流量细分**堆叠条：各 AI 平台占比，图例 9 项
   （ChatGPT / Others / Gemini / Claude / Perplexity / Replit / Grok / Copilot / DeepSeek）。
3. **动态流量分布**面积图（按所选时间段，实测 6 个月跨度）+ 右侧
   **`AI 平台 (5/10)` 复选列表 + 搜索框**，列「平均流量」，**共 22 个平台**
   （上述 9 个之外还有 Bolt / Manus / Mistral / Poe / Qwen / DuckAi / Lovable /
   CharacterAi / Cursor / Meta / DeepMind / You / ChatPdf）。带 Excel 导出图标——**未碰**。
4. **真 table「来自聊天机器人的热门落地页」**：
   - `URL` / `文件夹` 视图切换
   - 4 列：`URL (N)` / `URL 流量` / `URL 流量份额` / `流量细分`
     （细分是每个 AI 平台占比的小色条；一行被拆成多段说明非 ChatGPT 来源占比明显）
   - **20 行/页**，实测分页器 `1 / 50`，合计 999 个 URL

## 形状与就绪

- 形状：**真 table + 图表混合**。`readyBranch=table`，cells 105 / **filledCells 100**，
  svgText 16，**2 轮 poll 即就绪**，`stopReason=census-stable-shot-unstable`，exit 0。
- 是 Similarweb 少数几条机器不盲的路由之一，不需要 `--ready-text`。
- 主滚动条在内层 `.sw-layout-scrollable-element`（平台通例），
  `ground-truth.mjs --scroll-container auto` 已处理。

## 怎么采

```sh
platforms/similarweb/ai-traffic/overview/collect.sh [domain] [months] [out-dir]
# 例：collect.sh openai.com 6m
```

**999 个 URL / 50 页**要全量走翻页批采，配方见
[`backlink/references/pagination-harvest.md`](../../../../backlink/references/pagination-harvest.md)。
头部几页通常就够回答这页存在的问题。

## 已知坑

| 坑 | 细节 |
|---|---|
| **少了 `&key=` 就变「空态等输入」** | 这正是第三轮把本页误判成「功能空」的原因。**看到空态先查 URL，不要结案** |
| 路径段必须留字面 `*` | 把域名塞进路径段是无效的（冷载时路径段被忽略） |
| **只在一个域名上测过** | 机制（缺 `key=` 导致空态）是 URL 级、与域无关；但「任意域都有 AI 流量数据」**没有第二个域名的证据**，别当定论 |
| census href 剥值 | `sanitizeUrlString` 把 `key=` 的**值**剥空（留键名）；核对上下文用 manifest 的 `url`/`targetUrl` |
| Excel 导出图标 | 导出是消耗/写操作，按纪律不碰 |
| 时间段/国家段可能被改写 | 平台会把上次 UI 选的值写进新 URL；**模板永远以落地 href 为准** |

## 验证记录

- **2026-08-30** 双证人采集，域 `openai.com`，全球，6 个月，会话 `similarweb-nav`，
  机器级 `tools-share-similarweb` 锁全程持有。
  截图 ⇄ census deepText 抽查顶部卡数值、堆叠条百分比、平台平均流量、
  落地页表前几行的流量与份额、分页器 `1 / 50` 共 **10 个读数全部命中**。
  证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round4-ai-traffic-openai/`。
- 截图档案：`assets/loaded.png`。
