# Referrals · 引荐出站（outgoingTraffic）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/websiteanalysis/referrals/*/999/1m?webSource=Total&selectedTab=outgoingTraffic&key=<域>`
  - 与 incoming 同构，只换 `selectedTab`

## 回答什么业务问题

这个站往外送流量给谁——出站合作、导流去向、生态位判断。

## 数据清单（canva.com，全球）

1. 指标卡：导出访问 59.7M；导出域名 866。
2. 域榜：google.com / chatgpt.com / youtube.com 居首。

## 形状与就绪

- 形状：与 incoming 同构，但本 tab 采集时 cells=0 且 svgText=0 →
  **readyBranch=null，exit 2（机器盲）**。**exit 2 ≠ 空**——59.7M / 866 与域榜
  在 deepText 与像素里俱全，判读靠 deepText grep + AI 读图。

## 怎么采

```sh
platforms/similarweb/referrals/outgoing/collect.sh [domain] [out-dir]
```

exit 2 属预期。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 机器盲 | 同构页 incoming 走 chart 分支而本 tab 全盲——同一组件不同 tab 就绪分支可以不同，别推广 |
| 漏 `&key=` = 空态 | 同平台通则 |

## 验证记录

- **2026-08-30** round3 双证人；59.7M / 866 双证人一致。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-referrals-outgoing/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #17。
- 截图档案：`assets/loaded.png`。
