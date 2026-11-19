# Referrals · 引荐导入（incomingTraffic）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/websiteanalysis/referrals/*/999/1m?webSource=Total&selectedTab=incomingTraffic&key=<域>`
  - 路径段字面量 `*`；域**只在 `&key=`**
  - 时长段 1m 落地实测被静默改写为 6m——模板以落地 href 为准

## 回答什么业务问题

谁在给这个站送流量：外链站点清单 + 各自份额——竞品外链来源、找可复制的引荐渠道。

## 数据清单（canva.com，全球）

1. 指标卡：推介访问 227.9M；外链站点 2,329。
2. 行业/话题分布图。
3. 域榜（100 行/页）：域 + 份额。首行 bit.ly 8.77%。

## 形状与就绪

- 形状：**chart**（readyBranch=chart，svgText=15）。榜单 DIV 不产 cells，就绪看 svgText 稳定。

## 怎么采

```sh
platforms/similarweb/referrals/incoming/collect.sh [domain] [out-dir]
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 时长段被静默改写 | 1m→6m；hijack 判定不受影响（只比前 3 段），记模板看落地 href |
| 漏 `&key=` = 空态 | 同平台通则 |

## 验证记录

- **2026-08-30** round3 双证人；227.9M / 2,329 / 8.77% 全命中。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-referrals-incoming/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #16。
- 截图档案：`assets/loaded.png`。
