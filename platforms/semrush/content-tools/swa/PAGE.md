# 内容工具组 · SEO Writing Assistant（文档列表）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/swa/`
- `document.title`：`所有文件：SEO Writing Assistant`
- **它同时是 `/seo-content-template/` 的 302 落点**——旧 SEO Content Template 已下线，
  直接采这条路由即可；从旧路由进须传 `--accept-redirect /swa/`。
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

「共享账号里已经写过哪些稿子、各自打了几分、目标词是什么」。
**列表页是读层**（既有稿子的评分与目标词可直接采）；
「分析新文本」之后的**编辑器是做层**（写稿/改稿），本项目用不到，本轮未进入。

## 数据清单

1. **文档计数与分组**：`所有文档 (N)`，分组 `所有 N / 我自己 N / 与我分享 N`。
   实测 10 份，全部为 `我自己`。
2. **每份文档一张卡**：标题 + 创建日期 + **目标关键词 chips**（超出显示「另外 N 个」）+
   **目标受众**（位置 / 设备 / 语言）+ **质量分数**（数值 + 等级文案：极佳 / 良好 / 糟糕）。
3. 右上「**分析新文本**」按钮 = 进编辑器，**做层入口，不点**。

## 形状与就绪

- 形状：**卡片列表**。`tables=0 grids=0 cells=0 filledCells=0 svgText=0`，
  deep textLength 1,602,851 / light 3,903。
- **readyBranch=`text`**：`--ready-text "质量分数为"`，2 轮 poll、**18.7 秒就绪**、`stable`。
- **不传 ready-text 时同样永远不就绪**：首采 24 轮 poll → `budget/exit=2`
  （对照证据保留在 `semrush-content-audit-swa/`）。

## 怎么采

```sh
platforms/semrush/content-tools/swa/collect.sh [out-dir]
```

等价于：

```sh
node backlink/scripts/ground-truth.mjs \
  --url "https://sem.proxy.example.com/swa/" --out <dir> \
  --budget 120 --max-screens 8 --ready-text "质量分数为"
```

## 已知坑

| 坑 | 细节 |
|---|---|
| **必须 `--ready-text`** | 双零页型，table/chart 分支都不接；不传必然 `budget/exit=2`，且极易被误记成「这页没数据」 |
| **只靠截图会漏读大半文档** | 首屏只见 3 份，其余仅 DOM 可见 |
| 「分析新文本」是做层入口 | 别点，页面边缘按钮，表格采集不会误触 |
| 文档是**共享账号**的 | 里面可能是别人的稿子，判读时别当成本项目产出 |
| 旧路由是它的别名 | `/seo-content-template/` 302 到这里；直接用 `/swa/` 省事 |

## 验证记录

- **2026-08-30** 双证人采集（`semrush-content-audit-swa-v2/`），会话 `semrush-nav`。
  截图 ↔ census 对质「所有文档 (10)」、「所有 10 / 我自己 10 / 与我分享 0」、
  各文档的质量分数与等级文案、关键词 chips，**像素↔DOM 全部命中**。
  无 ready-text 的对照样本 `semrush-content-audit-swa/` 保留为反例证据。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-content-audit-swa-v2/`。
- 截图档案：`assets/loaded.png`。
