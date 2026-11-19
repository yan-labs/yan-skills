# .Trends · 市场概览（Market Overview，Market Explorer 后继）

## 页面身份

- **结果页可 URL 直达**：`https://sem.proxy.example.com/analytics/traffic/market-overview/?lid=<listId>`
  - `lid`：**市场列表 id，页面身份所在**（本轮实测 lid=1234565，由表单喂 canva.com
    + 点「分析」生成）。`q=` 参数**不被吃**——想换市场只能换 lid 或走表单
- **入口表单**：`/analytics/traffic/market-overview/`。**注意**：开过一次后该裸路径会
  302 记忆到 `?lid=<上次列表>`；新建市场必须走「保存的列表 → 创建新列表」
- 老入口更正：`/trends/market-explorer/` 404；`/market-explorer/` 302 到本页
  （Market Explorer 已并入「流量与市场」）

## 回答什么业务问题

一个 niche 的市场规模（TAM/SAM）、增速、整合度、玩家四象限、逐家参与者的份额与渠道结构
——选生态位、找「规则改变者」（高增长小玩家）从这页进。

## 数据清单（canva.com 自动生成市场，全球，2026-07）

1. **市场摘要卡**：整合度（低）、主要参与者 top3（pinterest.com 26.44% /
   microsoft.com 24.96% / canva.com 16.07%）、域名 99/100、市场流量 49.4亿↑9.23%、
   市场流量成本 $10.7亿↑6.71%、**TAM 70亿 / SAM 68.6亿（TAM 的 97.95%）**。
2. **增长象限**（SVG）：X/Y 轴可换（默认 总流量 × 总流量增长率%）；四象限中文名
   规则改变者 / 领导者 / 利基市场参与者 / 已有参与者；默认画 12/99 个域名，带轨迹尾巴；
   可导出 PNG。
3. **市场参与者表**：99 行分 10 页，列 = 域名 / 市场份额 / 访问量+位差 / 直接+位差 /
   AI 流量+位差 / 引荐 / 自然搜索 / 谷歌 AI 模式 / 付费搜索 / 自然社交 / 付费社交 /
   电子邮件 / 展示广告 / 购买转化率 / 页数每访 / 唯一 / 平均时长 / 跳出率（各带位差）；可导出。
4. **四象限可解析性**：**数据在 DOM**——象限名与全部已画域名标签都是 `svg text` 节点
   （census svgText 17，svgTexts 数组原样读出）；气泡坐标在 SVG 属性里。不需要读像素。

## 形状与就绪

- 形状：摘要卡 + SVG 四象限 + 参与者 grid（2 grids，成品 346 filledCells）。
- **新建市场异步计算，能空骨架屏 40+ 分钟**——那是 computing，不是空页、不是付费墙。
- 就绪判据：`filledCells > 40` **或** `svgText > 10`；短 budget exit 2 → 回访，勿判决。
- AX 全盲（state 只有 RootWebArea）、CSS find 也失效——只有 lib-deep-dom 穿透可读。

## 怎么采

```sh
platforms/semrush/market-overview/overview/collect.sh [lid]
# 例：collect.sh 1234565（已有列表直达，budget 300）
```

**新建市场**（无现成 lid 时，手动配方，shadow DOM）：
1. 走「保存的列表 → 创建新列表」进表单（裸路径会被 lid 记忆劫走）；
2. 壳可能不水合：reload 一次，10 秒内出 input；
3. `el.focus()` + `document.execCommand('insertText')` 填域名 → 点「分析」；
4. **隔 15–60 分钟回访** `?lid=` 结果页再采。
配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| computing 假空态 | 骨架屏 40+ 分钟是「还在算」；单域名列表长时间 0 参与者是「还在算」不是「不支持」 |
| 裸路径 lid 记忆 | `/analytics/traffic/market-overview/` 302 到上次列表——表单只能从「保存的列表→创建新列表」再进 |
| `q=` 无效 | 身份在 `lid=`；带 q= 直达不会换市场 |
| 编辑弹窗单槽输入 | 「编辑」竞争对手弹窗一次只能填一个域名+Enter；连打会粘连（`figma.commiro.com`）；误开一律「取消」丢弃（只读纪律） |
| 表单壳卡水合 | 与 keywordgap 同病，reload 一次即好 |
| AX/CSS 双盲 | 只能 lib-deep-dom 穿透读；iframe 假设已排除（deep iframe=0） |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`，整轮持机器级 semrush 锁。
  抽查 26.44% / 24.96% / 16.07% / 99 / 13.1亿 —— 像素↔DOM **全 HIT**；
  canva.com 访问量 7.9亿 与 行业与批量分析 结果、历史 semrush-traffic 实测
  （790,000,000 / 11:02）三方一致。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-market-overview/`
  （表单入口）、`…-lid/`（computing 空态）、`…-lid-v2/`（成品：shot-quadrant3.png
  四象限全貌、shot-quadrant2.png 参与者表、census）；判决书 `…/semrush-ads-trends-VERDICTS.md`。
- 截图档案：`assets/quadrant.png`（成品四象限全貌）。
