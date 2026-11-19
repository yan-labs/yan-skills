# Rankup 网站全生命周期 Skill 设计

日期：2026-07-30
状态：已确认
目标版本：`2.0.0`

> **2026-08-16 更新（本文是 2026-07-30 的历史记录，正文不改）**：文中提到的
> `backlink-analyzer` 与 `gt` 两个 Skill 已分别并入 `backlink` 与 `rankup` 并删除，
> `browser-harvest` 同样并入 `backlink`。当时的依赖路由结论仍然成立，
> 只是承载它们的 Skill 少了三个。现状以 `README.md` 与各 Skill 的 `SKILL.md` 为准。

## 1. 目标

将 `rankup` 从以 SEO 为主的工作流扩展为一个网站全生命周期总控 Skill。它负责协调从机会调研、产品定义、项目初始化、Cloudflare 全栈开发、支付集成、部署验证、SEO、外链到长期迭代的全过程，并把项目特有的事实、决策和经验沉淀在项目内的 `.rankup/` 目录中。

`rankup` 是总控入口，而不是重复实现所有专业能力。遇到专项任务时，它应发现并调用对应 Skill，例如 Wrangler、Cloudflare Workers、Stripe、GT、backlink 和 backlink-analyzer。

## 2. 核心原则

1. **一个入口，分层加载**：主 `SKILL.md` 只保存路由规则、生命周期和强约束；详细操作放进 `references/`，按需读取。
2. **Cloudflare-first**：新项目默认将 SSR、API、数据库、对象存储和部署统一在 Cloudflare 上。
3. **先恢复上下文，再做变更**：每次执行先读取 `.rankup/INDEX.md` 和当前任务相关文件，再与代码、配置和线上状态核对。
4. **事实与经验分开**：当前配置、线上状态和历史经验分别记录；历史笔记不能替代实时验证。
5. **真实密钥永不落盘**：`.rankup/` 只记录密钥元数据，不记录 secret value。
6. **发布后必须验证真实结果**：构建成功或上传成功不等于完成，应检查线上响应、关键路径和绑定资源。
7. **可更新、可追踪**：Skill 包含发布版本；每个项目保存本地启用、检查和更新时间。

## 3. 生命周期

### 阶段 0：恢复项目上下文

- 判断是新项目还是已有项目。
- 读取 `.rankup/INDEX.md`、`PROJECT.md` 和任务相关文件。
- 检查 Git 状态、当前代码、环境绑定和线上状态。
- 若记录与真实状态冲突，以可验证的当前事实为准，并修正记录。
- 读取版本状态并按更新协议判断是否需要更新 `rankup`。

### 阶段 1：机会与市场调研

- 明确目标用户、使用场景、痛点和付费意愿。
- 搜索市场、竞品、关键词和趋势。
- 使用 `gt`、SEO 或其他研究 Skill 获取证据。
- 形成机会判断、最小产品边界和风险清单。

### 阶段 2：产品与技术设计

- 编写产品简述、信息架构和关键用户路径。
- 设计页面、数据模型、鉴权、支付和内容策略。
- 根据需求选择 Cloudflare bindings，不为可能存在的未来需求提前引入资源。
- 在 `decisions.md` 中记录重要取舍及其依据。

### 阶段 3：初始化 Monorepo

新站默认使用：

```bash
pnpm dlx shadcn@latest init \
  --preset b1D0eCA4 \
  --template start \
  --monorepo \
  --rtl \
  --pointer
```

初始化后检查实际目录结构、包管理器脚本、TanStack Start 配置、共享 UI 包和 TypeScript 配置，不能仅凭命令返回值判断成功。

### 阶段 4：建立 Cloudflare 全栈基础

- TanStack Start SSR、API 和服务端逻辑：Cloudflare Workers。
- 关系型和事务型数据：D1。
- 文件、图片、导出物和用户上传：R2。
- 缓存、低频读取配置：KV，不用作需要强一致性的主数据库。
- 异步任务：Queues 或 Workflows。
- 强一致协调和有状态实例：Durable Objects。
- 密钥：Worker Secrets、Cloudflare Secrets Store 或 CI Secrets。
- 环境、bindings、类型生成和部署：Wrangler。

需要 Cloudflare 操作时，优先确保安装：

```bash
npx skills add cloudflare/skills --skill wrangler -g -y
npx skills add cloudflare/skills --skill workers-best-practices -g -y
```

### 阶段 5：开发与验证

- 按小步、可验证的工作单元实施。
- 执行类型检查、单元测试、集成测试和生产构建。
- 数据库迁移分别验证本地、预览和生产环境。
- 记录关键调试结论、失败原因和可复用经验。

### 阶段 6：专项集成

有支付需求时安装并调用 Stripe Skill：

```bash
npx skills add stripe/ai --skill stripe-best-practices -g -y
```

遇到现有能力没有覆盖的任务时，先使用：

```bash
npx skills add vercel-labs/skills --skill find-skills -g -y
npx skills find "<需求>"
```

专项 Skill 提供实现规范；`rankup` 负责把决策、配置元数据、验证结果和后续事项写回项目记忆。

### 阶段 7：部署与真实验证

- 使用 Wrangler 管理环境、bindings、迁移和部署。
- 区分 preview、staging 和 production。
- 发布后检查真实域名、SSR HTML、API、数据库、R2、鉴权和支付回调。
- 记录部署版本、时间、环境、验证结果和回滚办法。

### 阶段 8：SEO 与内容增长

- 保留当前 `rankup` 的数据驱动 SEO 工作流。
- 使用 Search Console、Bing Webmaster、站点分析、抓取和 SERP 数据。
- 将机会按 `缺口 × 价值 × 可执行性` 排序。
- 每轮优先做少量高置信变更并记录前后结果。

### 阶段 9：分发与外链

- 用 `backlink-analyzer` 分析现状、竞争对手和机会质量。
- 用 `backlink` 执行合规的提交、触达和跟进。
- 记录目标、状态、结果和拒绝原因，避免重复或低质量操作。

### 阶段 10：长期迭代

- 监控技术健康、索引、流量、转化、收入和成本。
- 将实验、发布、故障与经验持续写入 `.rankup/`。
- 周期性压缩旧日志，把稳定结论提升到主题文件或参考文档。
- 只有经过验证且可跨项目复用的知识，才回流到 `rankup` Skill 仓库。

## 4. `.rankup/` 项目记忆

建议结构：

```text
.rankup/
├── INDEX.md
├── PROJECT.md
├── architecture.md
├── infrastructure.md
├── integrations.md
├── secrets.md
├── skill-state.json
├── baseline.md
├── keywords.md
├── decisions.md
├── audit.md
├── plan.md
├── experiments.md
├── releases.md
├── journal/
└── topics/
```

职责：

- `INDEX.md`：目录导航、推荐读取顺序和最近更新。
- `PROJECT.md`：用户、定位、商业模式、核心目标和非目标。
- `architecture.md`：应用、包、数据模型、服务边界和架构图说明。
- `infrastructure.md`：Cloudflare 账户资源的非敏感标识、环境、bindings 和域名。
- `integrations.md`：Stripe、邮件、分析、搜索平台等集成状态。
- `secrets.md`：仅保存名称、用途、环境、保管位置、负责人、访问和轮换状态。
- `skill-state.json`：`rankup` 本地版本、安装/启用时间和更新检查状态。
- `baseline.md`：技术、SEO、流量、转化和成本基线。
- `decisions.md`：重要决策、选项、依据和后果。
- `audit.md`：发现的问题和证据。
- `plan.md`：当前优先级、负责人、状态和验收标准。
- `experiments.md`：假设、变更、指标和结果。
- `releases.md`：部署版本、环境、验证和回滚。
- `journal/`：按日期保存开发、运营、排障和增长日志。
- `topics/`：可复用但仍属于该项目的主题经验。

这些文件默认可以提交 Git，但任何真实密钥、访问令牌、个人敏感信息和支付敏感信息不得写入其中。

## 5. 版本与自动更新协议

### 5.1 发布端元数据

在 Skill 目录增加 `rankup/skill.json`，作为随 Skill 发布的静态清单：

```json
{
  "schemaVersion": 1,
  "name": "rankup",
  "version": "2.0.0",
  "releasedAt": "2026-07-30T00:00:00Z",
  "source": "example-owner/yan-skills",
  "manifestUrl": "https://raw.githubusercontent.com/example-owner/yan-skills/main/rankup/skill.json"
}
```

版本采用语义化版本：

- patch：文字修正、兼容性修复、小经验补充。
- minor：向后兼容的新工作流、新集成或新模板。
- major：目录协议、核心行为或兼容性发生破坏性变化。

这次从 SEO 工作流升级为网站全生命周期总控，发布为 `2.0.0`。

### 5.2 项目端状态

项目内 `.rankup/skill-state.json` 保存动态状态：

```json
{
  "schemaVersion": 1,
  "skill": "rankup",
  "source": "example-owner/yan-skills",
  "scope": "global",
  "installedVersion": "2.0.0",
  "installedAt": "2026-07-30T00:00:00Z",
  "lastCheckedAt": "2026-07-30T00:00:00Z",
  "latestVersion": "2.0.0",
  "lastUpdatedAt": null
}
```

`installedAt` 指该项目首次由 `rankup init` 启用并记录的时间。Skills CLI 当前没有为 Skill 暴露可靠的 post-install hook，因此不能把它伪装成 CLI 精确复制文件的时刻。

### 5.3 检查与更新

每次进入 `rankup` 时：

1. 读取本地 `rankup/skill.json`。
2. 读取或初始化 `.rankup/skill-state.json`。
3. 若距 `lastCheckedAt` 未超过 24 小时，默认不进行网络检查。
4. 到期后读取 GitHub 上的发布清单并比较语义化版本。
5. 若存在新版本，先检查 Skill 目录是否包含尚未回流仓库的本地修改或经验。
6. 安全时按照安装范围执行：

```bash
# 全局安装
npx skills update rankup -g -y

# 项目安装
npx skills update rankup -p -y
```

7. 更新后重新读取 `skill.json`，确认版本真的变化，再更新 `installedVersion`、`latestVersion`、`lastCheckedAt` 和 `lastUpdatedAt`。
8. 若更新失败，保留旧版本，记录原因并继续执行不依赖新版本的任务。

自动更新仅更新 Skill 本身，不修改业务代码、不部署网站，也不覆盖项目 `.rankup/` 记忆。若检测到 Skill 安装目录存在未提交的本地修改，则停止自动覆盖并提示先备份或回流。

Skills CLI 已提供单 Skill更新命令 `skills update rankup`，因此不需要通过重复打开 GitHub 链接来重装。

## 6. Skill 文件结构

```text
rankup/
├── SKILL.md
├── skill.json
├── references/
│   ├── lifecycle.md
│   ├── cloudflare-stack.md
│   ├── project-memory.md
│   ├── integrations.md
│   └── seo-growth.md
└── scripts/
    └── check-version.mjs
```

- `SKILL.md`：触发条件、强制流程、任务路由和核心安全约束。
- `lifecycle.md`：十阶段工作流和完成标准。
- `cloudflare-stack.md`：资源选择、Wrangler、环境和部署验证。
- `project-memory.md`：`.rankup/` 模板、读写和压缩规则。
- `integrations.md`：Stripe、专项 Skill 发现和集成记录。
- `seo-growth.md`：迁移现有 SEO、内容和经验沉淀体系。
- `check-version.mjs`：读取本地与远端清单、比较版本、维护项目状态；更新动作使用显式参数触发，避免普通检查意外覆盖文件。

## 7. 触发边界

应触发：

- 从零建设网站、SaaS、工具站或内容站。
- 规划或初始化 TanStack Start Monorepo。
- 将站点部署到 Cloudflare。
- 为站点增加数据库、文件存储、支付、SEO 或外链。
- 分析站点表现并安排长期迭代。
- 恢复一个已有网站项目的上下文并继续工作。

不应自动接管：

- 与网站无关的普通代码修改。
- 用户明确指定只使用另一个专项 Skill 的独立任务。
- 未获得授权的生产数据删除、域名迁移、支付账户变更或其他高风险操作。

## 8. 验证场景

实施后至少验证：

1. **从零 SaaS**：要求建立 TanStack Start Monorepo、Workers、D1、R2 和 Stripe，确认 Skill 能正确分阶段、选择依赖并初始化项目记忆。
2. **已有站点 SEO 回归**：要求诊断点击率下降，确认新版本仍完整保留数据驱动 SEO 能力，不会无关地重建技术栈。
3. **成熟站点新增能力**：要求增加用户上传和支付，确认它先读取 `.rankup/`，再调用 R2、Wrangler 和 Stripe 工作流并更新项目记录。
4. **版本过期**：本地为旧版本、远端为新版本，确认检查脚本能识别范围、执行正确更新命令并验证结果。
5. **本地有修改**：Skill 安装目录存在未同步经验，确认自动更新不会直接覆盖。

## 9. 完成标准

- `rankup` 发布版本为 `2.0.0`。
- 主文件保持为轻量总控入口，细节按需加载。
- 现有 SEO 工作流和经验库没有丢失。
- 新建站、Cloudflare、Stripe、外链和长期迭代路径均有明确路由。
- `.rankup/` 能作为项目级事实、决策、日志和经验库使用。
- 版本清单、项目状态、检查脚本和更新命令可以实际验证。
- 所有变更通过 Skill 结构检查、脚本测试和代表性场景测试。
