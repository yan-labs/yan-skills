# 纪律十一：令牌统一放 Skill 根目录的 `.env`（全文）

> 入口在 [`discipline.md`](../discipline.md) 十一，那里只留一句规则；本文件是全文（2026-11-27 从 discipline.md 拆出）。

**由 Rankup 脚本直接读取的第三方令牌只有一份，放在 Skill 根目录的 `.env`，所有项目共用；官方哥飞凭据由其 CLI 自管，不由 Rankup 读取。**
这些令牌属于**工具账号**（关键词难度、SERP、体检这类第三方服务），不属于任何一个站点。放进项目就会出现同一个令牌在 N 个项目里各存一份，
过期时要改 N 处，漏掉的那几处会以「配额用尽」「未授权」的面貌出现，排查方向完全错。

| | 放什么 | 例子 |
|---|---|---|
| Skill 的 `.env` | 跨项目的工具账号令牌**真实值** | `SERPER_API_KEY`、`CLOUDFLARE_API_TOKEN`（若是 Global API Key 还要 `CLOUDFLARE_EMAIL`） |
| 项目的 `secrets.md` | 本项目专属凭据的**名称、用途、保管位置**，绝不写真实值 | 部署密钥、支付密钥 |

1. **必须被 `.gitignore` 排除，且要断言。** `git add -f` 就能绕过 `.gitignore`，所以 `scripts/validate-rankup.mjs` 断言它不被 git 追踪，违反即构建失败。与 `registry.md` 用同一条防线。
2. **读取顺序：环境变量优先，再退到 Skill 的 `.env`。** 便于临时覆盖。
3. **调用方脚本必须和驱动脚本用同一套解析。** 只看环境变量的调用方会在令牌配好的情况下判「没有令牌」，退回匿名档撞配额，而报错在教人去设一个已经设好的变量。
4. **令牌失效时更新这一个文件**，不在项目里另建副本；某处读不到，修读取逻辑。
5. **真实值不出现在任何回复、日志、提交或落盘数据里。** 需要说明时只说键名与所在文件。
6. **Cloudflare 凭据额外认一套 `CF_` 简写别名**，统一解析走
   [`../scripts/lib-cf-auth.mjs`](../../scripts/lib-cf-auth.mjs) 的 `resolveCfAuth`（2026-09-13 收敛）：
   API Token 方式认 `CLOUDFLARE_API_TOKEN` 或 `CF_API_TOKEN`（同时设置时 `CLOUDFLARE_API_TOKEN`
   优先）；都没有则退到 Global API Key 方式，email 认 `CLOUDFLARE_EMAIL` 或 `CF_EMAIL`、
   key 认 `CLOUDFLARE_API_KEY` 或 `CF_GLOBAL_KEY`（同样 `CLOUDFLARE_*` 优先），email 与 key
   必须成对出现。`cf-zone-setup.mjs`、`cf-analytics-setup.mjs`、`cf-agent-baseline.mjs`、
   `cf-builds-connect.mjs`、`yandex-setup.mjs` 统一改走这个函数，不再各自手搓判据——
   曾经五份手搓实现各读不同的变量名，本机凭据明明配的是 `CF_EMAIL`+`CF_GLOBAL_KEY`，
   却有脚本读不到，正是规则 3「调用方脚本必须和驱动脚本用同一套解析」要挡的那类问题。
   account id 是同一类问题的另一处：认 `CLOUDFLARE_ACCOUNT_ID` 或 `CF_ACCOUNT_ID`
   （同时设置时 `CLOUDFLARE_ACCOUNT_ID` 优先），统一解析走同一个文件的
   `resolveCfAccountId`；两个都没配时它会调 `GET /accounts` 兜底，账号唯一直接用，
   账号为空或有多个则报错列出这两个变量名（不打印任何凭据值）。

安装后 `.env` 不存在是正常状态，首次需要令牌时创建即可。
