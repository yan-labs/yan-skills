# Cloudflare · 部署

> 本文件从 [`cloudflare-stack.md`](../cloudflare-stack.md) 拆出（2026-09-30），含原 §9「部署」。节号保持不变，文字里的「§9」指针指这里。

## 目录

- 9. 部署
  - 段 3 建站部署必做清单
  - 9.1 接入方式：Git 存储库连接 / Workers Builds
  - 9.2 应急兜底：本地 `wrangler deploy`

## 9. 部署

**默认方式是 Cloudflare 原生 Git 集成，不写 GitHub Actions 部署 workflow。** 原因：GitHub Actions
免费额度用完就断（已因账单问题整批失败过），而 Cloudflare 的构建额度对站点这个量级几乎用不完。
仓库里不应该出现给网站部署用的 `.github/workflows/*.yml`（跑测试、lint 的 workflow 不受此限）。
本地 `pnpm -C apps/<site> run deploy`（`wrangler deploy` / `wrangler pages deploy`）只作应急兜底；
Git 集成的自动构建与本地手动部署两条路径并存时，**以 Cloudflare 自动构建产生的 deployment 为准**。
**没有”额度用完自动切换”这种机制**，不要向用户承诺。

### 段 3 建站部署必做清单

脚手架跑通、仓库建好之后，**以下五步必须在段 3 内完成**，不留到段 5：

1. **安装 Cloudflare Vite 插件**：`pnpm -C apps/web add -D @cloudflare/vite-plugin`，在 `vite.config.ts` 里把 `cloudflare({ viteEnvironment: { name: "ssr" } })` 放在 `tanstackStart()` **之前**。
2. **创建 `wrangler.jsonc`**：在 `apps/web/` 下建，必填 `name`、`compatibility_date`、`nodejs_compat`、`main: "@tanstack/react-start/server-entry"`、`assets.binding`。
2b. **配置 `pnpm.onlyBuiltDependencies`**：在根 `package.json` 的 `pnpm.onlyBuiltDependencies` 数组里加入 `workerd` 和 `unrs-resolver`。Workers Builds CI 默认禁止 postinstall 脚本，不加这两个包会导致 workerd 原生二进制文件缺失、vite plugin 无法正确生成 `dist/server/wrangler.json`，deploy 阶段报 entry-point not found。
4. **接入 Workers Builds**：跑 `cf-builds-connect.mjs`（参数模板见 §9.1 表格），确认 trigger 已建、环境变量已写。GitHub App 首次装到 org/user 时需要浏览器 OAuth，装完后全程走脚本。
5. **触发并验证首次构建**：Workers Builds 连接后**不会自动构建**，需手动触发一次或 push 一个命中 watch paths 的提交，确认构建成功且线上可访问。

**判据**：push `main` 后 3-5 分钟内 Cloudflare 自动构建部署，线上响应更新。未达到此判据，段 3 部署环节不算完成。

### 9.1 接入方式：Git 存储库连接 / Workers Builds

**优先用脚本走 API，不开浏览器。** 下面的控制台路径只在 GitHub App 还没装到目标 org/user
（一次性 OAuth 授权，API 做不到）时才需要，装完之后新项目全程走 `cf-builds-connect.mjs`；
判据见 [`discipline.md`](../discipline.md) 五「有 API/CLI 且有凭据就不开浏览器」。

控制台路径：Workers & Pages → 选中项目 → Settings → 构建（Build）→ Git 存储库「连接」。
GitHub App 授权必须由用户本人在控制台点，安装时选 **Only select repositories**（不要整个组织）。

#### API 路线（Workers Builds，已验证 2026-09-10）

用 `node scripts/cf-builds-connect.mjs --help` 看完整参数；`--dry-run` 只打印将要调用的
端点与 payload（密钥隐去）。前提仍是 GitHub App 已装到目标 org/user 且勾了目标仓库——这一步
没有 API，只需做一次，做完之后同一个 org 下的所有仓库都不用再开浏览器。

**端点链**（脚本内部按顺序调用）：

1. `GET /accounts/{account_id}/workers/services/{worker}` 取 `default_environment.script_tag`。
2. `PUT /accounts/{account_id}/builds/repos/connections` 建仓库连接，拿 `repo_connection_uuid`。
   需要 `provider_account_id`（GitHub org/user 的数字 id，不是登录名）；脚本用 `gh api
   orgs/<owner>` / `gh api users/<owner>` 猜，猜不出就去已接过的姊妹项目跑一遍
   `GET /accounts/{account_id}/builds/workers/{script_tag}/triggers` 抄 `repo_connection` 字段。
3. `POST /user/tokens` 新建窄权限 build token：Workers Scripts Write、Account Settings
   Read、User Details Read；绑自定义域名（`custom_domain` / `route`）时再加 Workers Routes
   Write，`resources` 限定到那一个 zone，不给全账号权限。
4. `POST /accounts/{account_id}/builds/tokens` 把上一步的 token 登记为该 Worker 专属的
   build token，拿 `build_token_uuid`。
5. `POST /accounts/{account_id}/builds/triggers` 建 trigger：`external_script_id`
   （即 script_tag）、`repo_connection_uuid`、`build_token_uuid`、`branch_includes`、
   `root_directory`、`build_command`、`deploy_command`、`path_includes`/`path_excludes`。
6. `PATCH /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables`
   写构建变量（`NODE_VERSION`、`PNPM_VERSION`，对齐 `package.json` 的 `packageManager`）。

**watch 排除清单**（`--path-exclude`，避免文档/设计改动触发无谓构建）：
`.rankup/**`、`**/*.md`、`.claude/**`、`.design/**`。

**permission groups 的坑**：账号级权限组（Workers Scripts Write / Account Settings Read /
Workers Routes Write）在 `GET /accounts/{account_id}/tokens/permission_groups`；用户级权限组
（User Details Read）在另一个端点 `GET /user/tokens/permission_groups`——两者不在同一张列表
里，混着查会报「找不到权限组」。

**连接后不会自动构建**：与下方 9.1.1 的实测一致，Workers Builds 连接成功不会触发首次构建，
需要一次命中 watch paths 的 push，或手动调 `POST
/accounts/{account_id}/builds/triggers/{trigger_uuid}/builds` 触发一次来验证。首次构建实测
51–82 秒成功。

**Pages 项目（纯静态站）**：

| 配置项 | 值 |
|---|---|
| Production branch | `main` |
| Root directory | 留空 |
| Build command | `pnpm install --frozen-lockfile && pnpm -C apps/<site> run build` |
| Build output directory | `apps/<site>/<outdir>` |
| 环境变量 | `NODE_VERSION`、`PNPM_VERSION`（对齐 `package.json` 的 `packageManager`） |
| Build watch paths | include `apps/<site>/*`、`apps/<site>/**/*`、`pnpm-lock.yaml` |

**Workers Builds（TanStack Start / SSR）**：

| 配置项 | 值 |
|---|---|
| Branch | `main` |
| Root directory | 留空 |
| Build command | `pnpm install --frozen-lockfile && pnpm -C apps/<site> run build` |
| Deploy command | `pnpm -C apps/<site> exec wrangler deploy --config dist/server/wrangler.json` |
| 环境变量 | `NODE_VERSION`、`PNPM_VERSION`（同上） |
| Build watch paths | include `apps/<site>/*`、`apps/<site>/**/*`、`packages/**`、`pnpm-lock.yaml` |

**deploy_command 必须指向 vite build 生成的配置**：`@cloudflare/vite-plugin` 在 `vite build` 时
生成 `apps/<site>/dist/server/wrangler.json`（内含 `"main":"index.js"` 和 `"no_bundle":true`），
wrangler 实际读的是这个生成配置。源 `wrangler.jsonc` 的 `main` 是虚拟路径
`@tanstack/react-start/server-entry`，在 CI 环境下 wrangler 无法解析，deploy 阶段会报
`entry-point file not found`。本地 `wrangler dev` 能跑是因为 vite plugin 做了 redirect，
但 `wrangler deploy --config wrangler.jsonc` 在 CI 里不走这条路。

【实测 2026-09-06，某 pnpm monorepo（Node 26，pnpm 10.33.4）】Pages 项目连接后
自动触发首次构建，50 秒内成功，Node 26 可用；Worker 项目连接后**不会自动触发构建**，
需要一次命中 watch paths 的 push 才会构建。项目内如已有该仓库自己的部署实测记录文档，
优先参考它，不要跨项目硬编码路径。

**Git 集成不会自动补齐收尾**：冒烟测试和回滚按项目流程配置；回滚用控制台的 Rollback 或 `wrangler rollback`。IndexNow 的 Workers Builds 部署命令接法与实际配置/日志回读，统一见 [搜索平台发布流程](../search-platforms.md#挂进发布流程这一节是规则不是建议)。

#### 9.1.1 实测注意（2026-09-06）

- **Workers Builds 连接不自动构建**：Pages 连接后立即自动构建；Workers Builds 连接后不会自动触发，需一次命中 watch paths 的 push。Pages 里被 watch paths 排除的 commit 显示 skipped，属正常。
- **控制台路径**：Worker 部署列表 `/workers/services/view/<worker>/production/deployments`；构建历史 `/workers/services/view/<worker>/production/builds`（「部署」标签页内「前往构建历史」）；单次构建详情页顶部标题右侧有「重试构建」按钮。
- **构建状态 API**：按 worker 列构建 `/accounts/<id>/builds/workers/<worker>/builds` 实测始终返回空数组（已知问题）；但**单次构建状态和日志可用**：`GET /accounts/<id>/builds/builds/<build_uuid>` 返回构建详情（status/build_outcome），`GET /accounts/<id>/builds/builds/<build_uuid>/logs` 返回构建日志。build_uuid 在手动触发或 webhook 响应中获取。**trigger 配置可 PATCH 更新**：`PATCH /accounts/<id>/builds/triggers/<trigger_uuid>` 可以修改 deploy_command、build_command 等字段，无需删除重建。
- **幽灵依赖坑**：apps/web 直接 import 只在 packages/ui 声明的包（如 `sonner`），本地能过、Cloudflare `pnpm install --frozen-lockfile` 后解析失败。接入前必须在 `mktemp -d` 做干净克隆验证：`git clone --depth 1 + pnpm install --frozen-lockfile + pnpm -C apps/<site> run build` 全部通过，所有直接 import 的包都要在本包 package.json 声明。
- **实测耗时**：Pages 静态站约 50 秒，Worker（TanStack Start）约 58 秒；Node 26.8.1 可用。
- **skipped 构建的真实原因（2026-09-07 用 API 确认更正）**：此前记录"手动 wrangler deploy 抢占排队中的自动构建导致 skipped"是错误归因。真实原因是 Cloudflare Pages 的 build watch paths 不匹配 `apps/<site>/**` 这种写法——单独的 `**` 通配符不会命中该目录下的一级文件，导致对应 commit 被判定为不在 watch 范围内而 skipped。改成 `apps/<site>/*` + `apps/<site>/**/*`（一级文件 + 更深层级都覆盖）后重试构建即可成功。手动 `wrangler deploy`/`wrangler pages deploy` 与 Git 自动构建各自生成独立的 deployment 记录，并存时以后完成的那次为准，不会导致对方被标记 skipped。配置与重试都可走 Pages API（`source.config.path_includes` 改 watch paths、`deployments/<id>/retry` 重试构建），不必开浏览器。Pages 一次自动构建约 1 分钟，Workers 约 1 分钟，push 后等 3 到 5 分钟再看。
- **用 wrangler 查状态，不用浏览器**：Pages 项目用 `pnpm -C apps/<site> exec wrangler pages deployment list --project-name <项目>`，Source 列是 commit hash 的就是 Git 自动构建，Status 为 Idle 表示排队、Active 表示当前生产。Workers Builds 没有 wrangler 命令，`wrangler deployments list` 只能看版本与时间，构建成功与否要看控制台 `/workers/services/view/<worker>/production/builds`。
- **GitHub App 接入，看不到 Webhooks**：Cloudflare 与仓库的连接走 GitHub App，仓库 Settings → Webhooks 里看不到条目，属正常。

### 9.2 应急兜底：本地 `wrangler deploy`

只在 Git 集成不可用（临时调试、Git 集成尚未连上）时使用，不作为常态部署路径：

1. 检查工作树和精确提交。
2. 运行类型检查、测试和生产构建。
3. 执行或确认目标环境 D1 迁移。
4. 使用 Wrangler 部署明确环境。
5. 读取部署结果，记录 Worker 版本/部署 ID、时间、Git SHA 和 URL。
6. 等待目标部署实际进入可服务状态。
7. 执行下一节的 live verification。

Wrangler 报”上传成功”只证明产物送达某个控制面步骤，不证明 custom domain、生效版本、bindings 或业务路径正常。

