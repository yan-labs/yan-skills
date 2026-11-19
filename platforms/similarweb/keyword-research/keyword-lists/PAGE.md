# 关键词列表（monitorkeywords）

## 页面身份

- URL 模板：`https://sim.proxy.example.com/#/digitalsuite/acquisition/monitorkeywords/home`
  - **无域名/关键词上下文参数——这是账号级页面。**
  - 入口 href 是从 KW home 页深穿透抓到的绝对链接，换 host 即可。
- 上级：`../OVERVIEW.md`

## 回答什么业务问题

「我们自己在这个共享账号里攒了哪些词表」。**它不产报表数据，是个账本。**
采集价值低但非零：真正有用的场景是回访某个已存列表。

## 数据清单

1. 标题「关键词列表」+ 右上角「**+ 创建新列表**」按钮——**写入口，不点。**
2. **3 个 tab**：所有 / 我的列表 / 共享列表；旁边一个 `Search for keyword list` 搜索框。
3. **真 table，4 列**：`关键词列表 (N)` / `关键词`（词数）/ `持有人` / `最近修改`，
   每行末尾一个 `⋯` 行操作菜单——**也是写入口，不点。**
4. 实测 **11 个列表**。
   ⚠️ 第三轮在 KW home 页上记的「关键词列表 16」是**另一处计数**，与本页的 11 不一致；
   **以本页表头的 `(N)` 为准。**

## 形状与就绪

- 形状：**真 table**。`readyBranch=table`，cells 60 / filledCells 44，
  `stopReason=stable`，3 步到底，exit 0。
- **是 KW 组里少数几条机器不盲的路由之一**，不需要 `--ready-text`。

## 怎么采

```sh
platforms/similarweb/keyword-research/keyword-lists/collect.sh [out-dir]
```

## 已知坑

| 坑 | 细节 |
|---|---|
| **两处计数不一致** | KW home 的「关键词列表 16」≠ 本页表头 `(11)`；以本页为准 |
| 两个写入口 | 「+ 创建新列表」和行尾 `⋯`。两者都在页面边缘，**表格采集不会误触**，但手动探路时要绕开 |
| 账号级页面 | 没有域名上下文，采回来的是**共享账号**全体的列表，不一定与当前任务相关 |

## 验证记录

- **2026-08-30** 双证人采集（只读一次），会话 `similarweb-nav`。
  截图 ⇄ deepText 双向命中表头计数、若干行的词数与最近修改日期。
  「+ 创建新列表」按钮**只被截图记录，从未点击**。
  证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round4-monitorkeywords/`。
- 截图档案：`assets/loaded.png`。
