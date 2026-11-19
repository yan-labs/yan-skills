# Audience · 受众重叠（website-audience overlap）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/websiteanalysis/website-audience/*/999/6m?webSource=Total&key=<d1>,<d2>,<d3>&selectedTab=overlap`
  - 路径段是字面量 `*`；**域全部走 `&key=`，逗号分隔可带多域**（实测 3 域一次深链直达）
  - `selectedTab=overlap` 小写

## 回答什么业务问题

几个站的受众重合多少、专属受众各多大——判断「同一批人」还是「两个市场」，
投放与联名/替代关系分析的底表。

## 数据清单（canva.com, figma.com, adobe.com，6m，全球）

1. **三圆 venn**：canva 214.7M / figma 15.39M / adobe 183.6M；总独立受众 371.3M。
2. 共享受众矩阵：两两重叠比例（canva∩adobe 16.6% = 35.61M）。
3. 趋势折线 + 专属度条。
4. 页头显示 canva vs figma vs adobe（三输入确实全被接受）。

## 形状与就绪

- 形状：**chart**（readyBranch=chart，svgText=33）。无真 table，就绪看 svgText 稳定。

## 怎么采

```sh
platforms/similarweb/audience/overlap/collect.sh [d1] [d2] [d3] [out-dir]
# 默认 canva.com figma.com adobe.com
```

配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 单域退化 | 对比类必须多输入；只带一个域不构成功能证据 |
| census href 剥值 | `key=` 的三域值被剥空（留键名）；核对用 manifest 的 `url` |
| 图例归一化风险 | 域名以页头/矩阵行头为准（Semrush 侧曾把子域归一到根域，同类警惕） |

## 验证记录

- **2026-08-30** round3 双证人；214.7M / 15.39M / 371.3M 全命中。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-audience-overlap/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #15。
- 截图档案：`assets/venn.png`。
