---
name: gefei
argument-hint: <你的 SEO 问题>
description: 哥飞 SEO 工具箱——用哥飞 SEO 工具箱（seo.web.cafe）的实时数据做 SEO 研究：关键词难度（哥飞版 KD）、搜索量、拓词、SERP 解密、网站流量与 DR、站点出词、网站估值、外链评估、域名起名与注册查询、页面体检、AdSense 预检。用户提到选词、关键词难度、竞品流量、某个网站靠什么词、域名能不能注册、网站值多少钱、买外链值不值、页面怎么优化、出海建站做什么需求时使用。
---

# 哥飞 SEO 工具箱

用哥飞的方法、seo.web.cafe 的**实时数据**回答 SEO 问题，不要凭记忆编数字。

用户这次的问题（通过 `/gefei 问题` 调用时才有）：$ARGUMENTS

## 两种调用方式，有 MCP 先用 MCP

1. **接了 gefei MCP**（工具名形如 `mcp__gefei__keyword_difficulty`）：直接调这些工具，参数就是下文命令行的参数。
2. **没接 MCP**：用本技能自带的命令行 `scripts/webcafe.mjs`（零依赖 Node.js 18+）。Claude Code 里完整路径是 `~/.claude/skills/gefei/scripts/webcafe.mjs`，下文写作 `node ~/.claude/skills/gefei/scripts/webcafe.mjs`；下面列的 `keyword_ideas "种子词"` 之类都是它的子命令。

同目录下还有几个一键工作流技能：`/gefei-keywords`（选词）、`/gefei-competitor`（拆竞品）、`/gefei-domain`（域名尽调）、`/gefei-page`（页面优化）。

## 准备

需要环境变量 `WEBCAFE_TOKEN`（或用户已运行过 `node ~/.claude/skills/gefei/scripts/webcafe.mjs login <令牌>`）。
没有令牌时，请用户到 https://seo.web.cafe/api/ 用 Web.Cafe 账号登录、生成令牌，再告诉你或自己设置。

```bash
node ~/.claude/skills/gefei/scripts/webcafe.mjs me          # 看积分余额（API 可用多少）
node ~/.claude/skills/gefei/scripts/webcafe.mjs tools       # 全部接口与价格（以这里为准）
node ~/.claude/skills/gefei/scripts/webcafe.mjs help <接口>  # 某个接口的参数
```

## 每次调用都花积分

- 每次调用从用户的**积分余额**里扣（用户在网站购买的积分、邀请好友得到的奖励积分；每日赠送额度只能在网站用，API 用不了），结果后面（stderr）打印「扣 N 积分 · 剩余 M · req_xxx」；余额快见底时还会多打一行「! 积分余额不多了」——看到这行，在回答末尾提醒用户去补充。
- **先想清楚再调**：能一次批量的别拆开（`domain_traffic`、`domain_dr`、`keyword_volume`、`bulk_keyword_difficulty` 都支持数组）；同一个问题别重复查。
- 预计要花 30 积分以上的一连串调用，先跟用户说明大概会花多少再动手。
- 调用被拒（这次不扣费）就停下，**不要换着接口重试**：先把已经查到的结果整理好答给用户，再转告原因——
  - `code=quota`：积分余额不够，告诉用户去 https://seo.web.cafe/wallet/ 购买（网站每天送的额度不能给 API 用）；
  - `code=day_cap`：余额还在，只是今天到了每日上限，告诉用户北京时间早上 8 点清零，不用购买。

## 调用方式

```bash
node ~/.claude/skills/gefei/scripts/webcafe.mjs <接口> [主参数] [--参数 值] [--json]
```

- 第一个必填参数可以直接写成位置参数；数组写成 `a,b,c`。
- 加 `--json` 拿结构化 JSON（适合你自己继续处理）；不加时有报告的接口输出 Markdown 报告。
- 结果很长时用 `--out 文件` 写到文件再读需要的部分。

## 先取方法论手册

哥飞的方法论写在专题手册里：该先查什么、各数据的口径怎么解读、哪些结论不能下。动手前按问题取 1~3 本（每本约 2 积分）：

```bash
node ~/.claude/skills/gefei/scripts/webcafe.mjs load_guide keyword,traffic --md
```

手册：keyword（选词）/ newwords（新词）/ domains（域名）/ traffic（查流量）/ attribution（流量归因）/ discovery（找站找词）/ backlinks（外链）/ knowledge（知识库引用）。手册末尾会写明哪些工具 API 里没有（谷歌趋势、外链趋势、GSC 等浏览器插件与站内账号类工具），跳过那些步骤。

## 哥飞说过什么：知识库

- **首选** `knowledge_ask "新站多久开始做外链"`：一次调用就把最相关的几篇及其相关段落连同出处、日期一起给你，8 积分/次。一个问题调一次就够，**不要拆成多次检索 + 逐篇阅读**（那样一个问题要花几十积分）
- `knowledge_search "新站 外链"`：只要线索时用（标题、日期、链接、短节选），4 积分/次
- `knowledge_read --doc-id <docId> --query "…"`：用户追问某一篇的细节时才用，按返回字数计费
- 知识库每个账号每天可读取的量有上限，只在用户真的需要哥飞原话或案例时用；引用时注明出处与日期。

## 按任务选接口

**选词 / 判断一个词能不能做**
1. `keyword_ideas "种子词" --limit 50` 拓词（带搜索量、CPC、预筛难度、意图）
2. `bulk_keyword_difficulty --keywords a,b,c` 海选预筛（快照口径，只用来砍量）
3. 挑 3~6 个候选用 `keyword_difficulty "词"` 做哥飞版精评（0-100 分 + 判断原因 + 链接预算 + 前十盘面）
4. 需要官方搜索量与 12 个月趋势时用 `keyword_volume --keywords a,b`
5. 想知道第一页每个结果凭什么排在那里：`serp_review "词"`

两种难度分是不同口径，**不要放在一张表里比大小**：预筛难度只用于海选，结论以哥飞版 KD 为准。

**看竞品 / 某个网站**
- `domain_overview 域名`：流量、渠道、地区、DR、域龄、主力流量词（先看这个）
- `site_keywords 域名 --limit 50`：它靠哪些词吃流量、落地页是哪页
- `site_history 域名`：搜索流量逐月历史（较贵，只在归因「什么时候、靠什么起来的」时用）
- 多个站比较：`domain_traffic a.com,b.com,c.com`、`domain_dr a.com,b.com`
- 批量查 Ahrefs DR：`domain_dr a.com,b.com,…`，一次最多 100 个，每 20 个查上游的域名 1.5 积分，30 天内查过的走缓存不收费（筛外链目标、过滤域名清单时用它，别逐个查）

**需求挖掘**
- `translate_demand "英文需求描述"`：一句话需求 → 有真实搜索支撑的词
- `search_known_sites --terms ai,resume --maxDr 40`、`search_known_keywords --terms generator --maxScore 30`：本站库里现成的站和词（便宜）
- `stripe_checkout_referrals`：哪些站在给 Stripe 收银台送付费流量（在赚钱的站）

**域名**
- `brand_naming "产品描述"`：起名并核查注册、谷歌纠错、撞名
- `domain_availability a.com,a.ai`：能不能注册
- `bulk_domain_scan --n1 ai --dict1 py2 --tlds .com`：按规则批量扫可注册域名
- `domain_review a.com,b.com`：给候选域名打分
- `domain_timeline 域名`：买老域名前看历史快照时间线

**网站交易与外链**
- `website_worth 域名`：估值与月收入
- `backlink_value 域名 --price 150`：这条外链值不值
- `find_link_prospects --minDr 40 --maxPrice 100`：筛外链资源

**页面优化**
- `onpage_audit --url https://… --keyword "目标词"`：40+ 项体检
- `page_coach https://…`：自动推断页面关键词并给 P0/P1/P2 建议
- `adsense_audit 域名`：AdSense 过审预检
- `fetch_url https://… --mode text`：读网页正文；`serp "搜索词"`：看谷歌原始搜索结果

## 回答用户时

- 数字照实引用，注明口径（例如「哥飞版 KD」「SimilarWeb 口径月访问」「快照库估算」）。
- 查不到数据时如实说「没查到」，不要当成 0，也不要用别的数字凑。
- 用完告诉用户这次一共花了多少积分。
