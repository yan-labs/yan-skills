# Keyword Research · 关键词生成器（keyword-generator-tool）

## 页面身份

- URL 模板：
  `https://sim.proxy.example.com/#/digitalsuite/acquisition/findkeywords/keyword-generator-tool/999/28d?searchEngine=google&webSource=Total&isWWW=*&tab=phraseMatch&keyword=<URL编码词>`
  - `tab` = phraseMatch / related / trending / questions（4 个 tab）
  - `searchEngine=google` 已实证；amazon/youtube 见坑

## 回答什么业务问题

种子词扩词：语句匹配 / 相关 / 热门 / 问题 四路词库，带流量数——选题与长尾扩展的主力页。

## 数据清单（image editor，28d，Google）

1. 4 tab 计数：语句匹配 3,722 / 相关 280,240 / 问题 139。
2. 词榜（DIV，100 行/页）：词 + 流量 + 变化。首行 ai image editor 293.1K。
3. 头部合计：总流量 2.236M。

## 形状与就绪

- 形状：DIV 榜页型 → cells=0 且 svgText=0，**readyBranch=null，exit 2（机器盲）**。
  **exit 2 ≠ 空**——词榜在 deepText 与像素里俱全，判读靠 deepText grep + AI 读图。

## 怎么采

```sh
platforms/similarweb/keyword-research/keyword-generator/collect.sh [keyword] [tab] [out-dir]
# tab 默认 phraseMatch，可选 related|trending|questions
```

exit 2 属预期。配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 机器盲 | 三条就绪分支全盲；exit 2 不可信为空 |
| **Amazon/YouTube 词库未验证 ≠ 不存在** | UI 标题旁有搜索引擎下拉，但 `searchEngine=amazon` 冷深链落「额，出错了」错误页；合成事件点不开 portal 下拉。下轮：真 CDP 点击，或先在 UI 切一次再抄落地 URL |
| 搜索框 React 受控 | 换词优先改 `?keyword=` 深链，别驱动搜索框 |

## 验证记录

- **2026-08-30** round3 双证人（google）；抽查 293.1K / 324.3K / 2.236M 全命中。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-kw-generator-google/`
  （amazon 失败样本 `…-kw-generator-amazon/`）；判决书 `…/similarweb-round3-VERDICTS.md` 路由 #7。
- 截图档案：`assets/loaded.png`。
