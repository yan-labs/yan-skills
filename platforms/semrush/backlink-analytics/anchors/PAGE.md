# Backlink Analytics · 锚链接（anchors）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/backlinks/anchors/?q=<domain>&searchType=domain`

## 回答什么业务问题

锚文本分布——品牌锚 / 功能锚 / 裸 URL 的比例，竞品「被怎么叫」。
判断外链是自然生长还是站群模板灌出来的，也靠这页的双列对读。

## 数据清单（canva.com，2026-08-30）

1. **计数**：1-100，**总数不显示**（本页与其他明细页不同，没有总条数）。
2. **列**：锚文本 / 反向链接 / 域名 / 首次发现日期 / 上次发现日期。
3. 按锚链接筛选框；可导出。
4. 头部样例：edit image 32,105,651（**仅 3 域**）/ 无锚链接 25,544,188（148,228 域）/
   edit 7,369,305（64 域）/ canva 4,132,305（142,440 域）。

## 形状与就绪

- 形状：**grid 表**（readyBranch=table），约 500 cells/屏。
- 就绪判据：`filledCells > 0`，实测 **40 秒**。

## 怎么采

```sh
platforms/semrush/backlink-analytics/anchors/collect.sh [domain] [out-dir]
# 默认 domain=canva.com
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
semrush 机器锁、会话 `semrush-nav`。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **反链数 ≠ 域名数** | 两列可以差 **7 个数量级**：edit image 3,200 万条只来自 3 个域（站群级模板链接），canva 413 万条却来自 14 万域。读分布必须反链数 + 域名数**双列一起读**，单看反链列会把模板链当热门锚 |
| 无总数 | 页面不显示锚文本总条数，别拿「1-100」当规模证据 |

## 验证记录

- **2026-08-30**（会话 `semrush-nav`，整轮持锁）双证人抽查：32,105,651·3 /
  25,544,188·148,228 / 7,369,305·64 / 4,132,305·142,440——全部命中。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-backlinks-anchors/`；
  判决书 `…/semrush-backlinks-audience-VERDICTS.md` 页卡 3。
- 截图档案：`assets/loaded.png`（筛选框 + 表格头部与头部锚文本行）。
