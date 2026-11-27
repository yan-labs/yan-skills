# 站点引擎集成：GeFeiSites（MCP）

适用：项目的站建在 GeFeiSites 引擎上（站点数据由 AI 通过引擎的 MCP 工具写入，不改引擎代码）。
引擎地址、引擎 ID、令牌放在哪、默认建在哪个引擎，读全局层 `~/.rankup/README.md` 的「站点引擎」一节；本项目的 site id 读项目 `.rankup/infrastructure.md`。
站点清单不抄进任何文件，任何时候以 `list_sites` 为准；令牌和密钥哪一层都不写。

本文件只写「什么时候用哪个工具、读哪些返回字段、写回哪份记录」。参数、设置键、出错码不在这里：每次开工先调 `get_guide`，以它和工具自己的说明为准；两边不一致时信引擎，并按文末[核对漂移](#核对漂移)修这份文件。
引擎产品名只在本文件出现；入口、开工卡和闸门表只写「站点引擎」并指向这里（校验器按这条边界检查）。

last_verified: 2026-11-27，工具数 108（按引擎源码与新会话的工具列表核对）

## 开工核对（每次任务第一步）

1. 列出本任务要用的工具（见对应开工卡的「引擎站步骤」），确认当前会话里都看得到。建站最少要：`get_guide`、`create_site`、`update_site`、`theme_put`、`page_upsert`、`preview`、`check`、`publish`。
2. 看不到时：先按工具名搜索并加载延迟工具；工具不全先开新会话核对（客户端会缓存旧的工具列表），仍不全再检查连接器授权或改用令牌（只读令牌只下发只读工具，限定单站的令牌用不了引擎级工具）。
3. 仍不齐：不改用自建脚手架，不手工进后台逐页粘贴。按[稿件包](#稿件包没有-mcp-时的交付面)先产出文件，把缺哪些工具写进报告交回。
4. 引擎没连上游账号或正在升级：只读工具照用，写工具会拒绝并说明原因；照返回的话转告站长，稿件包照做。

## 返回里必须处理的字段

| 字段 | 怎么处理 |
|---|---|
| `tell_owner_now` | 立刻单独转告站长（例如去改 DNS 服务器），然后接着干活 |
| `needs_owner_confirm` | 这一步还没执行；把确认链接交给站长，之后用 `owner_confirm_status` 查结果，不代确认 |
| `done: false` | 参数不变再调，直到 `done: true` 才算数（大站的整站 `check`、`publish` 分批） |
| `domain_ready: false` | 只能说「已发布，域名还没生效」，不说已上线 |
| `tdh_warning` | 动了线上页的标题、描述或 H1；核对是否有意，有搜索流量的页只小修 |
| `check_first` | 没有 30 分钟内通过的整站体检；先跑整站 `check` |

## 工具分组（何时用）

| 组 | 工具 | 什么时候用 |
|---|---|---|
| 入门与全局 | `get_guide`、`engine_status`、`list_engines`、`list_sites`、`get_site` | 每次开工；看已有站避免同题与雷同；读单站设置、页面清单与域名状态 |
| 建站与设置 | `create_site`、`update_site`、`migration_assess` | 建站第一件事；写简报、语言与站点设置；老站迁入前评估 |
| 域名 | `domain_search`、`domain_bind`、`domain_orders`、`domain_where`、`spaceship_domains`、`domain_point_to_cloudflare`、`owner_confirm_status` | 候选域名查可注册与价格；绑定与重绑；查待确认操作 |
| 主题 | `theme_get`、`theme_put`、`theme_edit`、`theme_delete` | 写模板、样式、脚本；局部替换 |
| 页面 | `page_get`、`page_upsert`、`page_edit`、`page_delete` | 新建或更新页面（先 draft）；线上页只局部改 |
| 跳转 | `redirect_put`、`redirect_check`、`redirect_list`、`redirect_delete` | 改 URL、切域名前核对老网址 |
| 素材与品牌 | `asset_list`、`asset_put`、`asset_upload_url`、`asset_note`、`asset_delete`、`brand_set` | 先用站长传的素材；图标全套与分享图走 `brand_set` |
| SEO 产物 | `ads_txt_put`、`indexnow_submit`、`ai_crawlers`、`email_routing` | 广告声明；手动重推索引；查改 AI 爬虫策略；联系邮箱转发 |
| 性能与存储 | `media_sync`、`site_store` | 图片改由对象存储直发；访客数据单独存放 |
| 预览、体检、发布 | `preview`、`check`、`publish`、`list_versions`、`rollback`、`unpublish` | 草稿渲染与预览链接；整站体检；发布与回滚（发布级权限） |
| 上线清单与待办 | `launch_checklist`、`launch_tick`、`issue_add`、`issue_list`、`issue_update` | 上线项与下一项；外部做完打勾；站内问题台账（稳定 key） |
| 在线工具 | `site_tool_put`、`site_tool_list`、`site_tool_get`、`site_tool_delete`、`ai_tool_set`、`ai_jobs_list` | 工具站的在线工具与 AI 工具 |
| 会员与收款 | `saas_status`、`members_list`、`credits_grant`、`credits_history`、`orders_list`、`orders_reconcile`、`subscriptions_list`、`subscription_test_advance`、`order_refund`、`stripe_status`、`stripe_connect`、`stripe_self_test`、`stripe_test_checkout`、`stripe_refund` | 收费站的现状、自检、测试下单、补单；退款与存密钥要站长确认 |
| 数据与实验 | `pvuv_connect`、`pvuv_report`、`pvuv_funnel_save`、`pvuv_funnel_delete`、`experiment_create`、`experiment_arm_put`、`experiment_list`、`experiment_end` | 站内访问、漏斗、搜索来源；A/B 实验 |
| 互动 | `engage_stats`、`comments_list`、`comment_moderate`、`comment_reply` | 评论与互动读数 |
| 经验本与反馈 | `lessons_list`、`lesson_add`、`lesson_delete`、`feedback_search`、`feedback_submit`、`feedback_mine`、`feedback_answer` | 开工读经验本；引擎做不到的先搜再报上游 |
| 回收站 | `trash_list`、`trash_restore` | 清理前看可恢复项；彻底删除只有站长能做 |
| 游戏与玩家 | `game_list`、`game_upsert`、`game_check_embed`、`game_delete`、`data_put`、`data_get`、`data_delete`、`play_game_put`、`play_report`、`play_reset`、`play_records` | 游戏站 |
| 让访客回来 | `remind_status`、`push_send`、`newsletter_send`、`remind_schedule`、`remind_cancel`、`remind_subscriber` | 推送、邮件订阅与定时提醒（发布级） |

没有工具、只能站长在后台做的：删站、回收站彻底删除、迁移切换与切回、买域名下单、令牌新建与吊销、引擎级密钥、其他收款平台密钥、谷歌登录客户端、人机验证开关。

## 引擎已经替你做了什么，没做什么

自动处理：head（charset、viewport、title、description、canonical、Open Graph、结构化数据、统计代码）、裸域与 www 的 301、结尾斜杠统一、`sitemap.xml` 与 `robots.txt` 与 `llms.txt`、多语言 hreflang、发布时推 IndexNow、样式与素材的长缓存、页面边缘缓存、图标全套生成、站间雷同比对（重合度过高拒绝发布）。
整站 `check` 守着：TDK 与 H1 基础项、内链死链与孤儿页、结构化数据有效性、多语言标记、品牌图标与分享图、页面出现引擎名（发布被拦）。具体代码以 `get_guide` 为准。

**引擎体检不查的，仍归 rankup**：占位与建设中文案、关键词密度、description 重复、图片体积、PSI 与 CWV、可访问性语义、结构化数据的语义正确性、AI 爬虫实际可达、外部平台是否已接、文案体检。所以整站 `check` 通过只等于闸门表里标「覆」的行通过，不等于这一段通过。

## 闸门表「引擎站」列的取值

[`checklists.md`](../checklists.md) 段 3、4、5 的「引擎站」列：
**覆** = 引擎体检已覆盖，证据写整站 `check` 的 `done: true`、errors 为 0 与日期；**配** = 调引擎工具即可满足，证据写工具返回；
**外** = 照本行原判据用脚本或人工；**无** = 不适用，`checks.md` 记 N/A 与一句理由。
发布拦不拦听引擎；算不算过闸门听 `checklists.md`（rankup 的阈值更严时另核）。

## 各开工卡在引擎站上读写什么

| 卡 | 主动调的工具（按顺序） | 读回写进 `.rankup/` 的 |
|---|---|---|
| 选词与选品 | `lessons_list` → `list_sites` → 候选域名时 `domain_search` | 经验条目指针；域名可注册与价格进入口卡（黑历史仍按段 5） |
| 建站 | `get_guide` → `lessons_list`、`list_sites` → `create_site` → `update_site` → `asset_list` → `theme_put` → `page_upsert` → `brand_set` → `preview` → `check` | site id、引擎 ID 与版本、域名状态 → `infrastructure.md`；`check` 计数与日期 → `checks.md` |
| 上线前体检 | `check`（整站，到 `done: true`）→ `issue_list` → `preview`（取完整 HTML 喂脚本）→ `launch_checklist` | `check` 结果、未关待办、上线清单 → `audit.md`、`checks.md` |
| 上线接入 | `get_site` → `publish` → `pvuv_connect` → `update_site`（验证文件）→ `email_routing` → `ai_crawlers` → `launch_checklist` → `launch_tick` | 版本与变更 → `releases.md`；索引推送结果、统计、验证方式、邮箱 → `integrations.md` |
| 增长 | `saas_status`、`stripe_status`、`orders_list` → `pvuv_report` → `engage_stats` → `page_edit` → 实验三件 → `lesson_add` | 读数 → `baseline.md`；实验 → `experiments.md`；订单合计 → `integrations.md` |
| 接力、体检、整理 | `list_sites`、`get_site`、`issue_list`、`launch_checklist`、`list_versions`；整理前 `trash_list` | 与 `plan.md`、接力对账，不一致回写 |

站内可执行的问题以引擎待办（`issue_add`）为台账，`.rankup/audit.md` 只留指针和引擎管不到的项，不两边各记一份。

## 成批多站

1. 共用项由派单方取一次：`get_guide`、`lessons_list`、`list_engines`、`list_sites`、`engine_status`、`domain_search`，存成本批共用简报；各站单只读自己那一篇。
2. 批内每个域名先 `create_site`，返回的 `tell_owner_now` 合并成一张 DNS 清单一次发给站长。
3. 同一张设计画布出组件规范，每站各写五行设计说明：引擎发布时比主题与文案指纹，共用的是规范，配色、版式、文案各做各的。被雷同拒发时回设计，不改 class 名凑差异。
4. 每站一个稿件包、一个写入负责人；同一站不并发写。批内先发布一个站，其余站再整站 `check`，雷同比对才有对象。
5. 看板写项目层 `.rankup/batch-<日期>.md`：站｜域名就绪｜check errors｜未关待办｜下一项｜待站长确认。
6. 敏感操作（换域名、加语言域名、存收款密钥、退款、代改 DNS）攒到站长在线时一次发起：确认链接会过期，站长不在就只记看板。
7. 逐站 `publish`，`domain_ready` 为 false 的记「已发布，域名未生效」；外部接入按站循环，做完 `launch_tick`。

成批修同类问题：`issue_add` 给各站记同一个稳定 key，之后按 key 逐站 `issue_update`。

## 稿件包（没有 MCP 时的交付面）

后台执行者默认没有引擎 MCP，只产出稿件包，不调用任何线上写入、不进后台：
`site/<site>/theme/*.html`、`style.css`、`script.js`、`pages/<path>.json`（键：path、kind、title、description、content、body，status 一律 draft）、`settings.json`（只含要改的顶层键）、`assets/`。
有 MCP 的会话做写入循环：写入前先 `page_get` 对一下（站长可能在后台改过，以引擎为准回写稿件包）→ `theme_put`、`page_upsert` → `preview` → `check` → 把 findings 交回改稿，直到无 error。
`preview` 里登录、支付、评论不运行，这类验收只能在正式域名做。

## 降级

| 情形 | 做法 |
|---|---|
| 会话里工具不齐 | 工具不全先开新会话核对，仍不全再检查连接器授权或改用令牌（[开工核对](#开工核对每次任务第一步)第 2 步）；同时先把稿件包做完 |
| 执行者没有 MCP | 只交稿件包，报告写「未写入」 |
| 引擎做不到 | `feedback_search` → `feedback_submit`，告诉站长，报告写一行；不改引擎仓库，不绕到自建 |
| 发布、换域名、收款密钥、退款 | 不由执行者发起，写进报告交回 |

## 核对漂移

Skill 不抄参数、设置键、出错码，只写工具名与时机。引擎升级后、`engine_status` 的版本与上面 `last_verified` 不一致时、任何工具报「没有这个工具」时，跑只读核对：

- `node scripts/maintain/engine-tools-diff.mjs --names <文件>`：名单文件里每个工具名用空白分隔，取自新会话的工具列表（要用写或发布权限令牌的列表，只读令牌只看到一部分）；
- `node scripts/maintain/engine-tools-diff.mjs --engine-src <引擎源码目录>`：从源码的工具定义里取名。

输出「引擎新增」（判断要不要进上面的表）与「本文件有、引擎没有」（改名或下线，必须修）。顺带读引擎更新日志最新几条，看有没有改了用法没改名字的。改完更新 `last_verified`。

<!-- tools:start -->
ads_txt_put ai_crawlers ai_jobs_list ai_tool_set asset_delete asset_list asset_note asset_put asset_upload_url brand_set check
comment_moderate comment_reply comments_list create_site credits_grant credits_history data_delete data_get data_put domain_bind
domain_orders domain_point_to_cloudflare domain_search domain_where email_routing engage_stats engine_status experiment_arm_put
experiment_create experiment_end experiment_list feedback_answer feedback_mine feedback_search feedback_submit game_check_embed
game_delete game_list game_upsert get_guide get_site indexnow_submit issue_add issue_list issue_update launch_checklist launch_tick
lesson_add lesson_delete lessons_list list_engines list_sites list_versions media_sync members_list migration_assess newsletter_send
order_refund orders_list orders_reconcile owner_confirm_status page_delete page_edit page_get page_upsert play_game_put play_records
play_report play_reset preview publish push_send pvuv_connect pvuv_funnel_delete pvuv_funnel_save pvuv_report redirect_check
redirect_delete redirect_list redirect_put remind_cancel remind_schedule remind_status remind_subscriber rollback saas_status
site_store site_tool_delete site_tool_get site_tool_list site_tool_put spaceship_domains stripe_connect stripe_refund
stripe_self_test stripe_status stripe_test_checkout subscription_test_advance subscriptions_list theme_delete theme_edit theme_get
theme_put trash_list trash_restore unpublish update_site
<!-- tools:end -->
