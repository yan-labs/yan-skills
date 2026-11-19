# .Trends · 行业与批量分析（Bulk Analysis）

## 页面身份

- URL 模板：`https://sem.proxy.example.com/analytics/traffic/industry-and-bulk-analysis/`
  - 会自带记忆上次的 `lid=`；页内 tab：**批量分析** / 商家类别
  - 结果头可选维度：全球 / 月份 / 设备
- 老路由更正：外链侧的 ~~`/analytics/backlinks/bulk/`~~ 已 302 回 `/analytics/backlinks/`
  落地表单（单域名+竞品槽），**该老路由不存在**——真正的批量入口就是本页

## 回答什么业务问题

一次最多 **100 个域名**批量出 访问量 / 唯一访客 / 购买转化率 / 页数每访 /
平均访问时长 / 跳出率——筛竞品池、外链机会站的**配额友好**入口：一次「分析」动作
6 个域名同表出全（42/42 格），对比逐个跑 `/analytics/traffic/` 是 1 次请求 vs 6 次。

## 数据清单（canva/figma/miro/adobe/notion.so/capcut，全球 2026-07）

结果 grid，6 行 × 7 列 = 42/42 格满；可导出。样例值：

| 域名 | 访问量 | 其余实测 |
|---|---|---|
| canva.com | 7.9亿 | 唯一 2.1亿 / 购买转化率 0.21% / 页数每访 5.4 / 时长 11:02 / 跳出率 30.23% |
| adobe.com | 4.1亿 | 时长 09:12 / 跳出率 55.15% |
| figma.com | 1.4亿 | 页数每访 21.5 / 时长 15:58 |
| capcut.com | 7585.4万 | — |
| miro.com | 3117.1万 | — |
| notion.so | 2652.6万 | 跳出率 67.29% |

## 形状与就绪

- 表单区是**自绘行编辑器（「N/100 of 100 lines」）——不是 textarea**。
- 结果是 grid：`filledCells > 20` 即就绪，提交后约 60–90s 出值。
- AX 全盲（state 只有 RootWebArea）、CSS find 失效——只有 lib-deep-dom 穿透可读；
  iframe 假设已排除（deep iframe=0）。

## 怎么采

```sh
platforms/semrush/market-overview/bulk-analysis/collect.sh
# 打开本页做双证人快照（会落在 lid 记忆的上次结果上）
```

**提交新一批域名**（表单配方，踩了 4 次才通，尚无脚本——需页内 eval，持锁脚本内做完）：
1. 打开后壳常不水合，reload 一次出表单；
2. **别用打字**：编辑器对 insertText 的 `\n` 只认第一行（计数器停在 1/100），
   insertParagraph 会把首行挪到末尾粘连（`capcut.comcanva.com`）；
3. **用文件上传**：页内合成
   `new File([domains.join('\n')], 'domains.txt', {type:'text/plain'})` + `DataTransfer`
   塞给 deep DOM 里的 `input[type=file]`（accept=.csv,.txt）并 dispatch `change`
   ——计数器立即 N/100，「文件已上传」；
4. 点「分析」（deepQueryAll button 文本精确匹配），滚到 1200px 读结果 grid。
配额纪律见 `../../OVERVIEW.md`。

## 已知坑

| 坑 | 细节 |
|---|---|
| **打字丢行** | 自绘行编辑器不是 textarea：insertText 的换行被吞、insertParagraph 粘连——只有文件上传路线可靠 |
| AX/CSS 双盲 | 主内容同时骗过 CSS find 和 AX——别从盲读推「空白页」，直接上 lib-deep-dom |
| 壳卡水合 | reload 一次出表单（.Trends 通病） |
| lid 记忆 | 打开就带上次列表的结果——快照采到的可能是旧批次，判读前看清域名集合 |
| 跨脚本会话状态 | ground-truth 每轮结束会 close 会话——表单流程必须在一个持锁脚本内做完，或接受重开页面 |

## 验证记录

- **2026-08-30** 双证人判决，会话 `semrush-nav`，整轮持机器级 semrush 锁。
  抽查 批量分析(6) / 7.9亿 / 0.21% / 11:02 / 30.23% / 21.5 / 15:58 ——
  像素↔DOM **全 HIT**。canva.com 7.9亿 与市场概览参与者表、历史 semrush-traffic
  实测三方一致。省配额判定：**真省**——6 域名 1 次请求出全，无逐域名开报表。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-bulk-analysis/`
  （shot-upload.png 表单+骨架、shot-table.png 成品表）；判决书
  `…/semrush-ads-trends-VERDICTS.md`。
- 截图档案：`assets/results.png`（6 域名成品结果表）。
