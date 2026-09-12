#!/usr/bin/env node
/**
 * 给一个已存在的 Cloudflare Worker 接上 Workers Builds Git 集成（push 分支自动构建部署），
 * 全程走 Cloudflare API，不打开浏览器。已验证日期 2026-09-10。
 *
 * 用法：
 *   node scripts/cf-builds-connect.mjs \
 *     --worker <worker-name> \
 *     --repo <owner/repo> \
 *     --branch main \
 *     --root-directory apps/web \
 *     --build-command "pnpm build" \
 *     --deploy-command "pnpm exec wrangler deploy --config dist/server/wrangler.json && pnpm run indexnow" \
 *     [--zone <domain>] \
 *     [--path-exclude ".rankup/**" --path-exclude "**(slash)*.md" --path-exclude ".claude/**" --path-exclude ".design/**"] \
 *       （通配符里连续出现 "*" + "/" 会提前闭合本段注释，示例里用 (slash) 代替，实际传参用真的 "/"）
 *     [--env NODE_VERSION=22 --env PNPM_VERSION=10.33.4] \
 *     [--provider-account-id <github-org-or-user-numeric-id> --provider-account-name <github-org-or-user>] \
 *     [--trigger-name "Production (main)"] \
 *     [--dry-run]
 *
 * 参数：
 *   --worker            必需。目标 Worker 的名字（脚本用它查 script_tag）。
 *   --repo              必需。GitHub `owner/repo`。
 *   --branch            必需。触发构建的分支。
 *   --root-directory    必需。monorepo 内子项目目录（单仓库项目传仓库根目录名或按项目约定）。
 *   --build-command     必需。构建命令。
 *   --deploy-command    必需。部署命令。
 *   --zone              可选。给部署用的 build token 额外加 Workers Routes Write（限定该
 *                        zone），只有 wrangler 配置里用 custom_domain / route 绑定了自定义
 *                        域名时才需要。
 *   --path-exclude / --path-include  可选，可重复。不传 --path-include 时默认 `*`（全部纳入
 *                        watch，再按 --path-exclude 排除）。
 *   --env KEY=VALUE      可选，可重复。写入构建环境变量（非 secret）。
 *   --provider-account-id / --provider-account-name  可选。GitHub org/user 的数字 id 与登录
 *                        名。不给的话脚本用 `gh api repos/<owner>/<repo>` 猜 owner 类型
 *                        （org 或 user）后读对应端点；猜不出时报错，需要手动指定或去已经接过
 *                        Workers Builds 的姊妹项目跑一遍
 *                        `GET /accounts/{account_id}/builds/workers/{script_tag}/triggers`
 *                        从返回的 `repo_connection.provider_account_id/name` 抄。
 *   --trigger-name       可选。默认 `Production (<branch>)`。
 *   --repo-id            可选。GitHub 仓库的数字 id；不给则用 `gh api repos/<owner>/<repo>` 读。
 *   --dry-run            只打印将要调用的端点、方法与 payload（凭据字段隐去），不发请求。
 *
 * 前置条件（这一步 API 做不到，必须已经在浏览器里发生过一次，且只需一次）：
 *   目标 repo 所在的 GitHub org/user 必须已经装过 Cloudflare 的
 *   "Cloudflare Workers & Pages" GitHub App，且该 App 的仓库访问范围
 *   （Only select repositories）里已经勾了目标 repo。这是 Cloudflare 官方限制，不是本脚本
 *   的缺陷——`PUT .../builds/repos/connections` 在权限不够时会直接报错，报错文本会原样打
 *   印出来，此时去 GitHub → Settings → Installations → 对应 App → Repository access 里手动
 *   勾选目标仓库，勾完重跑本脚本即可，不需要重装 App、不需要为后续项目重复这一步。
 *
 * 凭据：只从环境变量读，不接受命令行参数、不打印、不落盘。二选一：
 *   CLOUDFLARE_API_TOKEN                          （scoped API Token，Authorization: Bearer）
 *   CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY         （Global API Key，X-Auth-Email/X-Auth-Key）
 * 账号有多个时用 CLOUDFLARE_ACCOUNT_ID 显式指定，否则脚本要求唯一。
 *
 * 本脚本会新建一个专用的、窄权限的 Cloudflare API token（Workers Scripts Write +
 * Account Settings Read + User Details Read，可选 Workers Routes Write 限定单个 zone），
 * 登记为这个 Worker 专属的 build token，不复用本机登录用的 token/key。新建 token 的密钥
 * 只在内存里流转，用完立刻丢弃，绝不打印、绝不写盘。
 *
 * 参考的 API 端点：
 *   GET    /accounts/{account_id}/workers/services/{service_name}
 *   PUT    /accounts/{account_id}/builds/repos/connections
 *   GET    /accounts/{account_id}/tokens/permission_groups         （账号级权限组）
 *   GET    /user/tokens/permission_groups                          （用户级权限组，与上面不是
 *                                                                    同一个端点，见下方踩坑记录）
 *   GET    /user
 *   POST   /user/tokens
 *   POST   /accounts/{account_id}/builds/tokens
 *   POST   /accounts/{account_id}/builds/triggers
 *   PATCH  /accounts/{account_id}/builds/triggers/{trigger_uuid}/environment_variables
 *   POST   /accounts/{account_id}/builds/triggers/{trigger_uuid}/builds   （手动触发首次构建，
 *                                                                          脚本不自动调用）
 *
 * 踩坑记录（2026-09-10 实测）：账号级权限组（Workers Scripts Write / Account Settings
 * Read / Workers Routes Write）与用户级权限组（User Details Read）活在两个不同的端点上：
 * `/accounts/{id}/tokens/permission_groups` 里没有 "User Details Read"，混着从一个端点查
 * 会直接报「找不到权限组」，必须分开查两次。
 */

const API = "https://api.cloudflare.com/client/v4"

function parseArgs(argv) {
  const out = { pathExclude: [], pathInclude: [], env: [], dryRun: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === "--help" || a === "-h") {
      out.help = true
      continue
    }
    if (a === "--dry-run") {
      out.dryRun = true
      continue
    }
    if (!a.startsWith("--")) continue
    const key = a.slice(2)
    const next = () => argv[++i]
    switch (key) {
      case "worker": out.worker = next(); break
      case "repo": out.repo = next(); break
      case "branch": out.branch = next(); break
      case "root-directory": out.rootDirectory = next(); break
      case "build-command": out.buildCommand = next(); break
      case "deploy-command": out.deployCommand = next(); break
      case "zone": out.zone = next(); break
      case "path-exclude": out.pathExclude.push(next()); break
      case "path-include": out.pathInclude.push(next()); break
      case "env": out.env.push(next()); break
      case "provider-account-id": out.providerAccountId = next(); break
      case "provider-account-name": out.providerAccountName = next(); break
      case "trigger-name": out.triggerName = next(); break
      case "repo-id": out.repoId = next(); break
      default:
        console.error(`未知参数 --${key}`)
        process.exit(2)
    }
  }
  return out
}

function printHelp() {
  console.log(`node scripts/cf-builds-connect.mjs --worker <name> --repo <owner/repo> --branch <branch> \\
  --root-directory <dir> --build-command "<cmd>" --deploy-command "<cmd>" \\
  [--zone <domain>] [--path-exclude <glob> ...] [--path-include <glob> ...] \\
  [--env KEY=VALUE ...] [--provider-account-id <id> --provider-account-name <name>] \\
  [--trigger-name <name>] [--repo-id <id>] [--dry-run]

给已存在的 Cloudflare Worker 接上 Workers Builds Git 集成，全程走 Cloudflare API。
凭据从环境变量读：CLOUDFLARE_API_TOKEN，或 CLOUDFLARE_EMAIL + CLOUDFLARE_API_KEY。
详细参数说明、前置条件与已验证的踩坑记录见本文件头部注释。`)
}

function authHeaders() {
  if (process.env.CLOUDFLARE_API_TOKEN) {
    return { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN.trim()}` }
  }
  if (process.env.CLOUDFLARE_EMAIL && process.env.CLOUDFLARE_API_KEY) {
    return {
      "X-Auth-Email": process.env.CLOUDFLARE_EMAIL.trim(),
      "X-Auth-Key": process.env.CLOUDFLARE_API_KEY.trim(),
    }
  }
  console.error(`找不到凭据。二选一：
  export CLOUDFLARE_API_TOKEN=...
  export CLOUDFLARE_EMAIL=... CLOUDFLARE_API_KEY=...`)
  process.exit(2)
}

function redactHeaders(headers) {
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = /authorization|auth-key/i.test(k) ? "<redacted>" : v
  }
  return out
}

async function cf(method, path, body, { dryRun } = {}) {
  if (dryRun) {
    console.log(`[dry-run] ${method} ${path}`)
    if (body) console.log(JSON.stringify(redactBody(body), null, 2))
    return {}
  }
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  })
  const json = await res.json()
  if (!json.success) {
    console.error(`Cloudflare API 报错 [${method} ${path}]:`)
    console.error(JSON.stringify(json.errors, null, 2))
    process.exit(1)
  }
  return json.result
}

function redactBody(body) {
  if (!body || typeof body !== "object") return body
  const clone = JSON.parse(JSON.stringify(body))
  if (clone.build_token_secret) clone.build_token_secret = "<redacted>"
  return clone
}

async function getAccountId(dryRun) {
  if (process.env.CLOUDFLARE_ACCOUNT_ID) return process.env.CLOUDFLARE_ACCOUNT_ID.trim()
  if (dryRun) return "<account-id>"
  const res = await fetch(`${API}/accounts`, { headers: authHeaders() })
  const json = await res.json()
  if (!json.success || !json.result?.length) {
    console.error("拿不到 account id，请设置 CLOUDFLARE_ACCOUNT_ID。")
    process.exit(1)
  }
  if (json.result.length > 1) {
    console.error(
      `这个凭据下有多个账号，请显式设置 CLOUDFLARE_ACCOUNT_ID：\n` +
        json.result.map((a) => `  ${a.id}  ${a.name}`).join("\n"),
    )
    process.exit(1)
  }
  return json.result[0].id
}

async function guessProviderAccount(repo) {
  const [owner] = repo.split("/")
  try {
    const { execFileSync } = await import("node:child_process")
    const out = execFileSync("gh", ["api", `orgs/${owner}`, "--jq", ".id"], { encoding: "utf8" }).trim()
    if (out) return { id: out, name: owner }
  } catch {
    // 不是 org，或者本机没有 gh，或者没权限——都退回 user 端点试一次
  }
  try {
    const { execFileSync } = await import("node:child_process")
    const out = execFileSync("gh", ["api", `users/${owner}`, "--jq", ".id"], { encoding: "utf8" }).trim()
    if (out) return { id: out, name: owner }
  } catch {
    // 忽略，走下面的报错
  }
  return null
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help) {
    printHelp()
    return
  }
  const missing = ["worker", "repo", "branch", "rootDirectory", "buildCommand", "deployCommand"].filter(
    (k) => !args[k],
  )
  if (missing.length) {
    console.error(`缺少必需参数：${missing.join(", ")}\n跑 --help 看用法。`)
    process.exit(2)
  }
  if (args.pathInclude.length === 0) args.pathInclude = ["*"]
  if (!args.dryRun) authHeaders() // 提前失败：没配凭据就别往下走

  const accountId = await getAccountId(args.dryRun)

  let providerAccountId = args.providerAccountId
  let providerAccountName = args.providerAccountName
  if (!providerAccountId || !providerAccountName) {
    const guessed = await guessProviderAccount(args.repo)
    if (!guessed) {
      if (args.dryRun) {
        providerAccountId = "<provider-account-id>"
        providerAccountName = "<provider-account-name>"
      } else {
        console.error(
          `猜不出 --provider-account-id / --provider-account-name（GitHub org/user 的数字 id）。\n` +
            `去已经接过 Workers Builds 的姊妹项目里跑一遍：\n` +
            `  GET /accounts/{account_id}/builds/workers/{script_tag}/triggers\n` +
            `从返回的 repo_connection.provider_account_id / provider_account_name 里抄，\n` +
            `或者手动指定这两个参数。`,
        )
        process.exit(2)
      }
    } else {
      providerAccountId ??= guessed.id
      providerAccountName ??= guessed.name
    }
  }

  const [, repoName] = args.repo.split("/")
  console.log(`[1/6] 查 Worker "${args.worker}" 的 script tag ...`)
  const service = await cf("GET", `/accounts/${accountId}/workers/services/${args.worker}`, undefined, args)
  const scriptTag = args.dryRun ? "<script-tag>" : service.default_environment.script_tag
  console.log(`      script_tag = ${scriptTag}`)

  console.log(`[2/6] 建仓库连接（${args.repo}）...`)
  let repoIdForConnection = args.repoId
  if (!repoIdForConnection) {
    try {
      const { execFileSync } = await import("node:child_process")
      repoIdForConnection = execFileSync("gh", ["api", `repos/${args.repo}`, "--jq", ".id"], {
        encoding: "utf8",
      }).trim()
    } catch {
      if (args.dryRun) {
        repoIdForConnection = "<repo-id>"
      } else {
        console.error(`拿不到 repo 的 GitHub 数字 id，且未提供 --repo-id。装了 gh CLI 并有权限访问 ${args.repo} 吗？`)
        process.exit(2)
      }
    }
  }
  const connection = await cf(
    "PUT",
    `/accounts/${accountId}/builds/repos/connections`,
    {
      provider_account_id: providerAccountId,
      provider_account_name: providerAccountName,
      provider_type: "github",
      repo_id: String(repoIdForConnection),
      repo_name: repoName,
    },
    args,
  )
  const repoConnectionUuid = args.dryRun ? "<repo-connection-uuid>" : connection.repo_connection_uuid
  console.log(`      repo_connection_uuid = ${repoConnectionUuid}`)
  if (!args.dryRun && connection.provider_account_id !== providerAccountId) {
    console.warn(
      `      注意：返回的 provider_account_id 和传入的不一致，可能连到了别的 GitHub 账号，核实一下。`,
    )
  }

  console.log(`[3/6] 建专用 build token（新建一个窄权限的 Cloudflare API token，不复用现有 token）...`)
  // 账号级权限组与用户级权限组活在两个不同的端点上，见文件头部注释「踩坑记录」。
  const permissionGroups = args.dryRun
    ? []
    : await cf("GET", `/accounts/${accountId}/tokens/permission_groups`)
  const userPermissionGroups = args.dryRun ? [] : await cf("GET", `/user/tokens/permission_groups`)
  const findPg = (name) => {
    if (args.dryRun) return `<permission-group:${name}>`
    const pg = permissionGroups.find((p) => p.name === name)
    if (!pg) {
      console.error(`找不到账号级权限组 "${name}"，Cloudflare 侧改了命名？`)
      process.exit(1)
    }
    return pg.id
  }
  const findUserPg = (name) => {
    if (args.dryRun) return `<user-permission-group:${name}>`
    const pg = userPermissionGroups.find((p) => p.name === name)
    if (!pg) {
      console.error(`找不到用户级权限组 "${name}"，Cloudflare 侧改了命名？`)
      process.exit(1)
    }
    return pg.id
  }
  const userId = args.dryRun ? "<user-id>" : (await cf("GET", "/user")).id

  const policies = [
    {
      effect: "allow",
      resources: { [`com.cloudflare.api.account.${accountId}`]: "*" },
      permission_groups: [
        { id: findPg("Workers Scripts Write") },
        { id: findPg("Account Settings Read") },
      ],
    },
    {
      effect: "allow",
      resources: { [`com.cloudflare.api.user.${userId}`]: "*" },
      permission_groups: [{ id: findUserPg("User Details Read") }],
    },
  ]
  if (args.zone) {
    const zones = args.dryRun ? [{ id: "<zone-id>" }] : await cf("GET", `/zones?name=${encodeURIComponent(args.zone)}`)
    if (!zones.length) {
      console.error(`找不到 zone "${args.zone}"。`)
      process.exit(1)
    }
    const zoneId = zones[0].id
    policies.push({
      effect: "allow",
      resources: { [`com.cloudflare.api.account.zone.${zoneId}`]: "*" },
      permission_groups: [{ id: findPg("Workers Routes Write") }],
    })
  }

  const tokenName = `${args.worker} Workers Builds`
  const newToken = args.dryRun
    ? { id: "<new-token-id>", value: "<redacted>" }
    : await cf("POST", "/user/tokens", { name: tokenName, policies })
  let secretValue = newToken.value
  try {
    console.log(`      cloudflare_token_id = ${newToken.id}`)
    console.log(`[4/6] 注册为 build token（密钥只留在内存里，不打印、不落盘）...`)
    const buildToken = await cf(
      "POST",
      `/accounts/${accountId}/builds/tokens`,
      {
        build_token_name: tokenName,
        build_token_secret: secretValue,
        cloudflare_token_id: newToken.id,
      },
      args,
    )
    const buildTokenUuid = args.dryRun ? "<build-token-uuid>" : buildToken.build_token_uuid
    console.log(`      build_token_uuid = ${buildTokenUuid}`)

    console.log(`[5/6] 建 trigger（分支 ${args.branch}）...`)
    const trigger = await cf(
      "POST",
      `/accounts/${accountId}/builds/triggers`,
      {
        external_script_id: scriptTag,
        repo_connection_uuid: repoConnectionUuid,
        build_token_uuid: buildTokenUuid,
        trigger_name: args.triggerName || `Production (${args.branch})`,
        build_command: args.buildCommand,
        deploy_command: args.deployCommand,
        root_directory: args.rootDirectory,
        branch_includes: [args.branch],
        branch_excludes: [],
        path_includes: args.pathInclude,
        path_excludes: args.pathExclude,
        build_caching_enabled: true,
      },
      args,
    )
    const triggerUuid = args.dryRun ? "<trigger-uuid>" : trigger.trigger_uuid
    console.log(`      trigger_uuid = ${triggerUuid}`)

    if (args.env.length) {
      console.log(`[6/6] 写构建环境变量（${args.env.map((e) => e.split("=")[0]).join(", ")}）...`)
      const body = {}
      for (const kv of args.env) {
        const eq = kv.indexOf("=")
        if (eq < 0) {
          console.error(`--env 参数格式应为 KEY=VALUE，收到：${kv}`)
          process.exit(2)
        }
        body[kv.slice(0, eq)] = { is_secret: false, value: kv.slice(eq + 1) }
      }
      await cf("PATCH", `/accounts/${accountId}/builds/triggers/${triggerUuid}/environment_variables`, body, args)
    } else {
      console.log(`[6/6] 未传 --env，跳过构建环境变量。`)
    }

    if (args.dryRun) {
      console.log(`\n[dry-run] 未发出任何请求。`)
      return
    }

    console.log(`\n完成。trigger_uuid=${triggerUuid}`)
    console.log(
      `下一次命中 watch paths 的 push（分支 ${args.branch}）会自动触发构建；` +
        `Workers Builds 连接后不会自动触发首次构建，需要一次真实 push 或调用\n` +
        `  POST /accounts/${accountId}/builds/triggers/${triggerUuid}/builds\n` +
        `手动触发一次来验证。`,
    )
  } finally {
    secretValue = null // 尽快丢弃，避免残留在进程内存里被后续代码误用
  }
}

main().catch((err) => {
  console.error(err?.stack || err)
  process.exit(1)
})
