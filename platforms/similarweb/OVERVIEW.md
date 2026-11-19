# Similarweb 平台总览

- **host：`sim.3ue.co`**（唯一合法面板 origin；所有 PAGE.md 的 URL 模板都在它上面）。
- 共享账号面板，**全站 hash 路由**：`location.pathname` 恒为 `/`，一切路由信息在 `#/…` 里。
  落点自检必须比对 hash 前 3 段；按 pathname 比对的检查对这站全盲。
- 会话固定 `similarweb-nav`；机器级锁 `<user>-tools-share-similarweb.lock`
  （`backlink/scripts/lib-tools-share.mjs`），整轮持有，不是逐条命令排队。
- 全部 URL 剥敏：`__gmitm=` 只留键名；Cookie/token/授权头一律不落盘、不进文档。

## 配额纪律（碰任何 sim.3ue.co 页面之前必读）

1. **web 配额与 API 配额是两个池子**。面板卡片上的进度条是 API 配额，对网页使用配额全盲——
   卡片显示 100% 剩余时网页侧照样可能被封锁（2026-08-30 实证）。
2. **封锁形态**：点「打开」→ 落 sim → 网关拒绝 → **< 3s 弹回 dash**，表现完全像「点击没反应」。
   拒绝理由只在 `document.referrer` 里（`gmitm.redirect.dash?msg=similarweb 今日配额已经耗尽…`），
   读取要 try/catch。页面整个重载,页内探针连同 window 一起被销毁（`window.__log === undefined`
   是重载指纹）。逐节点重试无意义——是账号级配额,不是节点挂了。
3. **配额探针 SOP**（先于一切采集）：`node backlink/scripts/tools-share-open.mjs --tool similarweb
   --goto <任一已知报表深链>`，15s settle 后仍在目标路由 = 有配额；< 3s 弹回 dash + referrer 带
   msg = 配额耗尽,当日收工。`pressure.mjs` 只数标签页和锁,不碰配额池,裁决 go ≠ 有配额。
4. 无 token 裸开 `https://sim.3ue.co/...` 也 302 回 dash,与配额耗尽长得一样——判别子:无 token
   弹回**没有 msg 参数**。启动必须走 launcher（tools-share-open.mjs）。
5. 一工具一采集者;手动探路也要在持锁的脚本内完成。

## 镜像抖动刷新法则（与配额无关，别混）

白屏 / 几十字节空响应 / 「出错了…请稍后重试」错误组件页 = **3ue.co 镜像瞬时抖动或 SPA 冷载壳**
（top document 停在 ~258 节点、body 0 字、五个 0×0 hook iframe），`location.reload()` 一次即愈。
ground-truth.mjs 的 stall-refresh 分支已内置。**连刷 3 次仍坏才暂记待重测**。
它与真空态（svgText=0 且 deepText 无数、无「无数据」文案）、假付费墙（升级弹窗，先查自己的 URL）
是三种不同形态，判决时分开写。

## 平台级坑（跨页面通用）

| 坑 | 表现 | 对策 |
|---|---|---|
| **body.innerText 不是水合判据** | 水合完的页 light DOM 也可能只有 ~1,072 字（内容在 3 个 shadow root 里，deepText 1.6M） | 判水合只用深穿透计数；任何「文本长度 > 阈值」探针在这站恒假 |
| **面板静默改写 URL 段** | 国家段 999→840、时长段 1m→6m 被落地后改写 | 记录 URL 模板以**落地 href** 为准；hijack 判定只比 hash 前 3 段所以不误报 |
| **深链改国家段无效** | 直接把 999 改 840 会被改写回 999（rankings 实测） | 换国家走 UI 下拉（shadow DOM，语义 find 失灵，deep `.click()` 可用），改完的 URL 可复制 |
| **主滚动条在内层 div** | `.sw-layout-scrollable-element`，window scrollY 恒 0 | ground-truth `--scroll-container auto` 已处理；手动滚要找最大 scrollHeight 容器 |
| **列主序 DIV 大榜不产 cells** | rankings 主榜、KW 组多条榜单 cells=0 | `filledCells>0` 不是这类页的就绪判据；看 svgText 或 deepText grep |
| **机器就绪三分支可能全盲** | 搜索框/列表页型 cells=0 且 svgText=0，exit 2 | **exit 2 ≠ 空**，是仪器看不见；判读靠 deepText grep + AI 读图 |
| **「空态等输入」不是判决** | AI Traffic 曾被记成「功能空」，真因只是 URL 少了 `&key=<域>` | 任何以「空态」结案的旧记录，**先补 `&key=` 重测一次**再说 |
| **冷深链落错误页有两种成因** | (a) 参数值不在枚举里 = 功能真没有；(b) 少了上下文参数 = 功能在、URL 写错 | **判别子：先把 UI 的下拉枚举出来。** 枚举里有 → (b)；没有 → (a)（生成器的 Amazon 就是 (a)，有 DOM 枚举 + 截图双证） |
| **合成事件打不开的下拉，真 CDP 能打开** | 第三轮点不开引擎下拉被误当权限问题 | `opencli browser <会话> click <css选择器>`；返回体 `click_method: "cdp"` **且** `hit: "target"` 才算真点到，多匹配必须带 `--nth` |
| **stall-refresh 会在无需水合的页上空转** | rankings 首页刷了 2 次，因为它本来就没有东西要动 | 这类页 exit 2 之后 grep deepText，不要加预算 |
| **census href 剥值** | sanitizeUrlString 把 `keyword=`/`key=` 的值剥空（留键名） | 核对上下文用 manifest 的 `url`/targetUrl，别用 census href |
| **搜索框是 React 受控 input** | 合成 value 无效；单 click 选不中联想项 | native setter + input 事件打字；选项要 pointerdown→mousedown→pointerup→mouseup→click 全序列 |
| **语义点击不可靠** | 行业树 `click --text` 落到第一个可点项 | 一律优先深链；shadow DOM 内用 deepQueryAll + `.click()` |
| **平台公告禁自动化** | 2026-08-13 公告严禁脚本/Bot 访问 | 已上报用户，是否继续由用户决定;只读、低频、单采集者是底线 |

## 与 Semrush 的口径分工

Similarweb 给**总访问量**（含直接/推荐），Semrush 域名概览给**自然搜索流量估算**，
同一站差三倍是常态。结论必须标口径,绝不放同一列。详见 `backlink/SKILL.md`。

## 板块索引

| 板块 | 目录 | 状态（2026-08-30 建成） |
|---|---|---|
| Keyword Research（关键词研究） | `keyword-research/` | ✅ 16/16 有 PAGE.md（round3 的 14 条 + round4 补的 keyword-generator-youtube、keyword-lists）。**更正**：monitorkeywords 已只读采过，是真 table；生成器的 Amazon 词库判定为不提供（枚举+截图双证） |
| Audience（受众重叠三域对比） | `audience/` | ✅ 1 页（overlap 深链 `key=a,b,c`） |
| Referrals（引荐进出） | `referrals/` | ✅ 2 页（incoming / outgoing） |
| Demand Analysis（需求分析·选题雷达） | `demand-analysis/` | ✅ 2 页（home、topic-report），判决 2026-08-29 |
| Website Rankings（站点排名·万域榜） | `rankings/` | ✅ 2 页（category-board 判决 2026-08-29、industry-picker 补齐 2026-08-30） |
| AI Traffic（AI 流量） | `ai-traffic/` | ✅ 1 页（overview）。**翻案**：此前记的「空态等输入」是错的，真因是 URL 少了 `&key=<域>`；补上后是真 table + 两张图 + 22 个 AI 平台 |
| 其他模块 | 未建目录 | 未勘测。**未勘测 ≠ 不存在** |
