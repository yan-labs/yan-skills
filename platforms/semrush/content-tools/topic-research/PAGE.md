# 内容工具组 · 主题研究（入口页）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/topic-research/`
  - **无 query 参数**。`db=` / `q=` 是否可用**本轮未实证**，别猜着用。
- `document.title`：`Topic Research: Topic Finder Tool for Finding Content Ideas`
  —— ⚠️ **与报表页完全相同**，不能拿 title 当落点判据，只看 `finalHref` 的 path。
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

这页本身不产数据，它是**报表的入口**：提交一个主题词 + 国家（+ 可选域名）换一份内容创意报表，
或者从「近期搜索」里点回一份已有报表。真正的数据在 `../topic-research-report/`。

## 数据清单

1. **搜索框**（输入主题词）+ **国家下拉**（默认 `US`）+
   「输入要执行内容查找的域名」输入框 + 「**获取内容创意**」按钮。
2. **「近期搜索」列表**：共享账号的历史查询（实测 5 条），每条带
   「**查看内容创意**」按钮——**点它是目前唯一已知的拿到报表 id 的办法**。
3. 顶部横幅「Need complete briefs… Try the SEO Brief Generator」是 Content Toolkit 的
   **交叉推广，不是本页功能**（那个工具在付费墙后，见 `../OVERVIEW.md`）。

## 形状与就绪

- 形状：**表单页 + 历史列表**。`tables=0 grids=0 cells=0 filledCells=0 svgText=0`，
  deep textLength 1,599,361 / light 413。
- **table 与 chart 两条分支都不成立** → 首次采集 24 轮 poll、2 次 stall 刷新、
  全程 `filledCells=0`，以 `stopReason=budget exit=2` 收场。
- **必须传 `--ready-text`**（例如 `获取内容创意` 或某条历史条目的稳定词）。

## 怎么采

```sh
platforms/semrush/content-tools/topic-research/collect.sh [out-dir]
```

这页的采集价值主要是**看历史列表里有哪些现成报表**。要报表本身走 `../topic-research-report/`。

**提交新查询（未实证，写下来是给下一个人的起点）**：按 `../../OVERVIEW.md` 的
React 受控组合框配方——`el.focus()` + `document.execCommand("insertText")` 打字、
`opencli keys Enter` 提交、纯 `button.click()` 点按钮；**别用 Escape 收下拉**（会清掉未提交文本）。
提交后记录落点 id 是怎么生成的。

## 已知坑

| 坑 | 细节 |
|---|---|
| **三条就绪分支全盲** | 不传 `--ready-text` 必然烧满预算 `exit=2`，且极易被误记成「这页没数据」 |
| **title 与报表页相同** | 落点判据只看 path |
| 历史列表是**共享账号**的 | 里面是别人的查询词，不一定与当前任务相关 |
| 顶部横幅是推广 | 「SEO Brief Generator」不是本页功能，点过去是 $60/月付费墙 |
| 表单是 POST 型 | 本轮未实证任何 `?q=` 直达写法，见下 |

## 验证记录

- **2026-08-30** 双证人采集，会话 `semrush-nav`。截图 `shot-s1.png` ↔ census 对质：
  标题 `Topic Research`、国家 `US`、按钮「获取内容创意」、5 条历史条目文本，
  **像素↔DOM 全部命中**，无单证人独有内容。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-content-audit-topic-research/`，
  历史点击拿 id 的过程证据在 `…/recent-click/`。
- 截图档案：`assets/loaded.png`。
