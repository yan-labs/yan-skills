# 关键词生成器 · YouTube 词库

## 页面身份

- URL 模板（**以落地 href 为准**）：
  ```
  https://sim.proxy.example.com/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d
    ?searchEngine=youtube&keyword=<URL编码词>&webSource=Total&isWWW=*&tab=phraseMatch
  ```
  - UI 切换引擎后 URL 可原样复制，**冷深链直开也成功，hash 未漂移**。
  - `tab=phraseMatch` 是本轮唯一落地过的值；第二个 tab 的参数值**未知**（见坑表）。
- 同一路由的 Google 词库见 `../keyword-generator/PAGE.md`。
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

「这个词在 YouTube 上还能带出哪些搜索词、各自多大量、点击去了哪些国家」。
做视频选题、给 YouTube 描述挖词从这页进。

## 引擎枚举：**只有 Google 和 YouTube，没有 Amazon**

真 CDP 点击 `[class*=GeneratorTypeDropdownContainer] button` 一次即开
（返回 `click_method: "cdp"`、`hit: "target"`）；穿透 shadow DOM 枚举下拉项
（`[class*=sc-hkMIXB]`）**恰好 2 项**：`Google`(y=68) / `YouTube`(y=116)。
截图里下拉面板同样只有这两行——无 Amazon、无 Bing、无 Play Store。

→ **`searchEngine=amazon` 判定为「本账号/本构建不提供」**，有 DOM 枚举 + 截图**双证**，
不是「未验证成功」。第三轮把它记成「冷深链落错误页，疑权限或点击手法问题」，**已更正**。
Google/YouTube 之外的值应当**预期**落错误页。

## 数据清单

1. **顶部趋势图**：「“<词>”的 YouTube 流量趋势」12 个月折线（Google 词库**没有**这张图）。
2. **只有 2 个 tab**：`语句匹配` / `相关关键词`（Google 词库有 4 个：语句匹配 / 相关 / 热门 / 问题）。
3. **主榜表头 5 列**：`关键字` / `规模` / `流量趋势` / `点击量` / `热门国家 地区`
   （Google 词库是 体量 / 平均体量 / 年趋势 / 零点击，**没有国家列**）。
4. 两个 tab 各自的总数标在 tab 上（实测 `ai image editor` 全球 28 天：
   语句匹配 106 / 相关关键词 3,465）。
   同一个词在 Google 词库是 3,722 / 280,240——**YouTube 词库量级小两个数量级，属正常**。

## 形状与就绪

- 形状：**趋势图 + DIV 大榜**。`readyBranch=chart`（svgText=18，21 秒内就绪），
  `stopReason=census-stable-shot-unstable`，exit 0。
- **与 Google 词库不同**：Google 那条是纯 DIV 大榜、三分支全盲 exit 2；
  YouTube 这条多一张趋势折线图，所以 chart 分支能接住。
- 这不是「同一张表换数据源」——列结构、tab 数量、图表都不同，**别做同构迁移**。

## 怎么采

```sh
platforms/similarweb/keyword-research/keyword-generator-youtube/collect.sh [keyword] [out-dir]
```

## 已知坑

| 坑 | 细节 |
|---|---|
| **`tab=` 的第二个值未知** | 本轮只落地在 `phraseMatch`。想直开「相关关键词」**请先在 UI 切一次再抄 URL，别猜**，尤其别照抄 Google 词库的 tab 名 |
| **Amazon 词库不存在** | 有枚举 + 截图双证。别再花时间试 `searchEngine=amazon` |
| 合成事件打不开引擎下拉 | 必须真 CDP `click`；返回体里 `click_method: "cdp"` + `hit: "target"` 才算真点到。`--text` 语义定位在这站不可靠 |
| 多匹配要 `--nth` | 否则 CLI 报 `matches_n: N` 并拒绝 |
| census href 剥值 | `keyword=` 的值被剥空；核对上下文用 manifest 的 `url`/`targetUrl` |

## 验证记录

- **2026-08-30** 双证人采集，词 `ai image editor`，全球，28 天，会话 `similarweb-nav`。
  截图 ⇄ deepText 抽查主榜前三行的规模/点击量/热门国家、两个 tab 的总数，**全部命中**。
  引擎下拉的枚举证据：`similarweb-round4-kw-generator-engines/shot-dropdown-open.png`。
  证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round4-kw-generator-youtube/`。
- 截图档案：`assets/loaded.png`（主榜首屏）、`assets/engine-dropdown.png`（引擎下拉只有两项）。
