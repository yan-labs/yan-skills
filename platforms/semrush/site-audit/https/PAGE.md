# Site Audit · HTTPS（review/https）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/https`
- 落点：**原样**（`…/review/https?__gmitm=`），`hijacked=false`
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

HTTPS 实施得对不对：证书、服务器配置、站点架构三组共 11 项检查，
每项要么通过要么给出问题页数。是上线前 checklist 里最快能过一遍的一页。

## 数据清单

1. **HTTPS 分数**（`分数： N%`）。
2. **11 张检查卡**，分三组：
   - **安全证书**（2 项）
   - **服务器**（4 项）
   - **网站架构**（5 项）
   每张卡是通过（绿勾）或列出受影响页数。

## 形状与就绪

- 形状：**卡片清单**。`cells=0`、`svgText=0`——**table 与 chart 分支都不接**。
- **必须传 `--ready-text "分数："`**。实测 `stopReason=stable`、`readyBranch=text`、
  3 poll / 3 步、`hijacked=false`。
- 与 `../issues/` 同属「卡片/列表型就绪盲区」：不传 ready-text 必然烧满预算。

## 怎么采

```sh
platforms/semrush/site-audit/https/collect.sh [campaign-id] [out-dir]
```

等价于：

```sh
node backlink/scripts/ground-truth.mjs \
  --url "https://sem.proxy.example.com/siteaudit/campaign/<CAMPAIGN_ID>/review/https" \
  --out <dir> --budget 120 --max-screens 8 \
  --ready-text "分数："
```

## 已知坑

| 坑 | 细节 |
|---|---|
| **导航瞬时失败会伪装成 hijack** | 前一轮这条路由 `hijacked=true`、`finalHref=/`、`deepTextLength` 只有 **88**——那是一张**几乎空白的页面**，不是别名重定向。成因是上一条路由刚烧满 200 秒预算 + 2 次刷新，标签页状态没缓过来 |
| **处置是重试，不是加 `--accept-redirect`** | `/` 不是本路由的合法别名；把它放进 accept 列表等于教脚本**把空白页当数据采回来**。本轮同一 URL 重试一次即正常落地 |
| 判别子 | `hijacked=true` + `finalHref=/` + `deepTextLength < 200` = 导航没成；真别名重定向的落点有实际路径且页面有内容（对照 `../pagereport/`：`/pagereport/pages`） |
| `分数：` 的冒号是全角 | 照抄，别换半角 |
| 双零页型 | `cells=0 svgText=0` 但满页数据，`stopReason=budget` 不等于没数据 |

## 验证记录

- **2026-08-30** 双证人采集（`route-https-v2/`），campaign `<CAMPAIGN_ID>`，会话 `semrush-nav`。
  census 的「HTTPS 实施 / 分数：」+ 11 条检查项 ↔ `shot-s2.png` 三组卡片
  （安全证书 2 / 服务器 4 / 网站架构 5）逐项一致。
  前一轮的失败样本 `route-https/`（`finalHref=/`、`deepTextLength=88`）**保留在证据目录里
  作为「导航瞬时失败 vs hijack」的反例证据**，别删。
  证据（本地，gitignore）：
  `backlink/evidence/ground-truth/semrush-siteaudit-example/route-https-v2/`。
- 截图档案：`assets/loaded.png`。
