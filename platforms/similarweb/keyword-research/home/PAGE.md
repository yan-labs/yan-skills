# Keyword Research · 首页（入口与关键词列表）

## 页面身份

- URL 模板：`https://sim.proxy.example.com/#/organicsearch/websiteanalysis/home`（无参数）
- hash 路由；侧栏「关键词研究」直达。左栏是整组 13 个子页的导航。

## 回答什么业务问题

Keyword Research 组的进门页：搜索框起查（词或域）、最近浏览快速回访、
关键词列表（monitorkeywords）入口。本身不产报表数据。

## 数据清单

1. 中央搜索框（词/域二合一，输入出联想下拉）。
2. 最近浏览 5 个域。
3. 关键词列表卡：16 个列表（我的 + 已共享）。
4. 左栏 13 个子页导航（本板块 OVERVIEW 的路由索引即由此而来）。

## 形状与就绪

- 形状：搜索框 + 卡片，**无表无图**：cells=0、svgText=0 → **readyBranch=null，
  ground-truth exit 2（budget）**。这是机器盲页型，exit 2 不是空。
- 水合判据：deepText（穿透 3 个 shadow root 约 1.6M 字符）；light body 仅 ~1,072 字，
  任何「innerText>阈值」探针恒假。

## 怎么采

```sh
platforms/similarweb/keyword-research/home/collect.sh [out-dir]
```

exit 2 属预期；判读靠 deepText grep（导航词/列表名）+ AI 读 shot。
配额纪律与配额探针 SOP 见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| 机器盲 | 三条就绪分支全盲，exit 2 ≠ 空 |
| 搜索框 React 受控 | native setter+input 事件打字；联想项要 pointerdown→…→click 全序列，单 click 无效 |
| 关键词列表未采 | monitorkeywords 是列表管理页，只录入口未进（怕误触「创建列表」） |

## 验证记录

- **2026-08-30** round3 双证人（会话 `similarweb-nav`，整轮持机器锁）。
  证据（本地，gitignore）：`backlink/evidence/ground-truth/similarweb-round3-kw-home/`；
  判决书 `…/similarweb-round3-VERDICTS.md` 路由 #1。
- 截图档案：`assets/loaded.png`。
