# 已证实的高频错误（禁止再犯）

> 从 [`discipline.md`](../discipline.md) 八移来（2026-11-27）：这是踩过的坑与正确做法，属于经验层；规则本身仍在各自的方法文档。

| 错误做法 | 正确做法 | 为什么是错的 |
|---|---|---|
| 为拿哥飞论坛内容去问 `ask`（哥飞.ai） | 先 `webcafe-forum.mjs chat-search` / `search` 拿原文，保留本地入口 | 2026-09-30 实时目录与试用确认：官方 chat 检索只有哥飞发言节选，knowledge_read 非全文且群聊去昵称；原文、论坛全集与悬赏投票榜无等价工具。本地悬赏榜和群聊搜索本轮实跑成功，官方知识库另扣积分 |
| 以为哥飞工具箱只有少量接口 | 加载[官方 `gefei` Skill](../seo-webcafe.md)，读取实时工具目录 | 工具能力与价格以供应商当前说明为准 |
| 为算 KGR/TDK 去开网页或消耗配额 | 本地命令 `kgr` / `string` / `money` / `email` | 纯本地、零配额、支持 `--batch` |
| 拿 `new.web.cafe` 的 HTTP 200 当「取到了」 | 看 `access` 字段 / 正文空不空 | 该站匿名不返回 401，只把正文抹成空串 |
| 对 `kind:collect` 的悬赏只读 `answers[]` | 读 `collect.board[]` | 征集型内容不在 answers 里，会对着几百条榜单报「0 条」且不报错 |
| 用站内哥飞 AI 代做调研或审站 | 直接用 官方 `gefei` Skill 调开放接口，Rankup 自己判读；`tools` / `me` 先查价格和余额 | 实时工具目录覆盖选词、流量、SERP、页面等数据；旧聊天路径不再是默认流程 |
| 用 Claude in Chrome / 手动 OpenCLI 操作 Similarweb、Semrush 面板 | `similarweb-query.mjs` / `semrush-overview.mjs` 等 | 脚本已存在，手操浪费上下文且不可复现 |
| OpenCLI 会话名用通用常量如 `work` | JS 用 `defaultSession('base')`；shell 用描述性常量 | 多任务撞名 → 拿到别人的页面，零报错 |
| 用沙箱浏览器访问页面 | `opencli browser <描述性会话名>` 驱动用户的 Chrome | 沙箱没有 cookie，登录面板会返回匿名态数据 |
| 手工去 GSC / Bing 后台点「提交站点地图」 | `webmaster-sitemap.mjs <gsc\|bing\|yandex> submit` | 两个后台各有坑，手操每次重踩 |
| 项目里维护「要推给 IndexNow 的 URL 数组」 | `indexnow-submit.mjs` 默认从线上 sitemap 取 | 硬编码数组必然漂移，方向永远是「新页面没推」 |
| 把 IndexNow 推送写成「文档里的一条命令」交给人记 | 焊进项目自己的 `ship` 命令（第九节） | 漏推不会让任何东西变红 |
| 用 Claude in Chrome 逐个点 GSC 移除工具 | `gsc-remove-urls.mjs` | 6 个 URL 要点 30+ 次且按钮位置漂移 |
| Cloudflare Web Analytics 手嵌 beacon 时把 `site_tag` 填进 `token` | `token` 必须是 `site_token`；接完用 GraphQL `rumPageloadEventsAdaptiveGroups(filter:{siteTag})` 查 `count > 0` | 两者同形（32 位 hex），填错不报错、脚本照样 200，只是永远 0 数据——一个站这样空跑了 45 天 |
| Lighthouse 单跑当性能基线 | `pagespeed.mjs collect --strategy both` 直接落 LHR JSON | 单跑只有实验室一半；现场那块不存在 = CrUX 流量不足，不是 0、不等于通过 |
| 页面有占位链接 / 占位文案 / 占位图片就上线 | 上线前全站扫一遍，占位一律清掉或整块删掉 | Google 会把它判成垃圾站，是段 3 的红线 |
| 文案里手打由构建脚本生成的数字（兼容条数、目录规模、扫描总数） | 组件从生成的 JSON 注入，文案留槽位 | 实测同一个站同时挂着三套数字：每次重建目录数字就漂，而文案不会跟着变 |
| 并行 sub agent 在共享 scratchpad 里用 `dump.json` / `edit.py` 这类无前缀文件名 | 文件名带自己的页面 slug 前缀 | 实测一个 agent 的中间产物被兄弟 agent 覆盖，脚本读到别人的数据且不报错 |
| `spawn(..., { detached: true })` 只靠 `try/finally` 清理 | 额外注册 `process.on('exit'/'SIGINT'/'SIGTERM')` 兜底 kill | 父进程被外部强杀（工具调用超时、会话中断、手动 kill）时 `finally` 不会执行，`detached`+`unref()` 的子进程会被系统收养成永久孤儿进程；`pagespeed.mjs` 的 `startForegroundKeeper` 曾因此留下一个每 15 秒抢一次前台焦点的常驻进程（2026-09-12）。后续复核发现这个具体案例其实不需要 detached 子进程——它是从一个本来就在跑的同步轮询循环里调用的，直接在循环里顺手 activate 即可，`pagespeed.mjs` 已在同一天改掉，不再有这套机制；本条规则本身仍适用于其他确实需要 detached 进程（父进程退出后仍要继续跑）的场景 |
| sub agent 撞 API 会话限额（429）死掉后从头重做 | 先看它已落盘的文件，限额重置后只补没做完的那半截 | 起稿类 agent 边写边落盘，死在改稿中途时文件往往已经改了一大半；重派前跑一次检查脚本定位剩余项 |
| 关键词短语命中一个 KD 极低的词就当机会 | 先亲眼看 SERP 页面类型再判 | 实测一个「计算器」类短语 KD 0，首页全是舞台灯光计算器；一个换算类词根的下拉被地名与机器名淹没；同名歧义是低 KD 最常见的假信号 |
| 在生产环境自测支付验证付款链路 | STG/沙箱无限测；积分验证用 D1 SQL 直接发放；PROD 付款等真实用户 | 自己给自己付款被支付商（Anyway/Stripe/PayPal）判定为欺诈性交易，触发风控甚至拉黑商户账号（2026-10-26 用户明确禁止） |
