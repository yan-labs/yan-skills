# Site Audit · 问题清单（review/issues）

## 页面身份

- URL 模板：`https://sem.3ue.co/siteaudit/campaign/<CAMPAIGN_ID>/review/issues`
- 落点：`…/review/issues?restrictions=<base64>&__gmitm=`
  - `restrictions` 是 base64 的 `{"search":"","severity":"all","checks":"nonzero"}`，
    **由页面自己写进 URL**（默认只显示非零检查项）。
  - 它落在 **query** 上，不影响 pathname 自检，**所以不需要 `--accept-redirect`**。
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

「这个站到底犯了哪些错、每条影响多少页、怎么修」——概览页给总数，这页给逐条清单，
每条带「如何解决」说明和一个下钻入口。

## 数据清单

1. **三档分组**：`错误 (N)` / `警告 (N)` / `通知 (N)`，红/橙/蓝三色条区隔。
2. 每条问题一行 DIV 卡片：问题文案（自带影响页数，形如「N 个页面…」）+
   「**如何解决**」展开说明 + 指向该问题详情的下钻入口。
3. 顶部筛选：搜索框、严重度选择（对应 `restrictions.severity`）、
   `checks=nonzero`（默认只列非零项，切成全量会把 0 命中的检查项也列出来）。

**下钻层未勘测**：点具体问题会进到问题详情（具体是哪些页、哪个字段）。
这是把体检结论变成可执行修复清单的关键一跳，**未勘测 ≠ 不存在**。

## 形状与就绪

- 形状：**DIV 卡片列表**。`cells=0`、`svgText=0`——**table 与 chart 两条分支都不接**。
- **必须传 `--ready-text "如何解决"`**。实测 `stopReason=stable`、`readyBranch=text`、
  readyAfterMs 30,286→37,708，3 poll / 3 步、0 次刷新。
- text 分支要求**连续 2 轮 `deepTextLength` 不变**才算就绪，所以关键词命中后还会再等一轮，正常。

> **本页是「卡片/列表型就绪盲区」的原型。** 不传 ready-text 时三条分支全盲，
> 采集会烧满预算以 `stopReason=budget` 收场——**而数据早就在 census 里了**。
> 判死之前先 grep 最后一份 `census-poll*.json` 的 `deepText`。

## 怎么采

```sh
platforms/semrush/site-audit/issues/collect.sh [campaign-id] [out-dir]
```

等价于：

```sh
node backlink/scripts/ground-truth.mjs \
  --url "https://sem.3ue.co/siteaudit/campaign/<CAMPAIGN_ID>/review/issues" \
  --out <dir> --budget 120 --max-screens 8 \
  --ready-text "如何解决"
```

## 已知坑

| 坑 | 细节 |
|---|---|
| **`--ready-text` 的 regex 别写死空格** | 前一轮用 `错误 \(\d+\)` **连烧 200 秒预算 + 2 次无效刷新**后 `stopReason=budget` 判死。页面里那串是「错误」+ **换行** + 「(1)」，中间是 `\n` 不是空格，正则里的字面空格永不匹配 |
| 别用导航词当判据 | `网站检测`、`概览` 这类词外壳一加载就命中，等于没判据。**首选单个稳定的正文词**（本页 `如何解决`） |
| `stopReason=budget` 不等于没数据 | 那次判死的 `route-issues/census-poll25.json` 里，问题清单文本已经躺了三分钟 |
| `restrictions=` 不必手传也不必放行 | 它是 query 参数，pathname 自检不受影响 |
| 具体问题与页数属某站当次结果 | 手册不留，需要就现采 |

## 验证记录

- **2026-08-30** 双证人采集（`route-issues-v2/`），campaign `<CAMPAIGN_ID>`，会话 `semrush-nav`。
  census 的三档分组文本 ↔ `shot-s2.png` 的红条/橙条同名条目逐条一致。
  失败样本 `route-issues/`（无 ready-text + 带空格 regex，`budget/exit 2`）**保留在证据目录里
  作为「就绪判据盲区」的反例**，别删。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-siteaudit-example/route-issues-v2/`。
- 截图档案：`assets/loaded.png`。
