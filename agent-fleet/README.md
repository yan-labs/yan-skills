# agent-fleet — 通用多模型子任务执行工具

给它一个任务描述 + 一个模型,它就用 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
驱动一个完整的自主 Agent(能读写文件、跑 bash、多轮工具调用直到任务完成)去执行,权限模式固定
`bypassPermissions`(不需要人工逐步确认每一步),跑完把结果返回。

**核心场景**:你想同时跑好几个任务,每个任务用不同的模型——比如同时起一个用 Gemini 写文案的任务、
一个用 DeepSeek 做调研头脑风暴的任务,两个并行跑,互不干扰,跑完各自把结果交回来。

**纯本地工具**:完全不经过 Kollab 或任何托管基础设施,就在这台机器上跑。模型接的是**你自己的**
第三方 API key(DeepSeek、Moonshot/Kimi 官方,或你自己有的任何 Anthropic 兼容端点)。

## 它是怎么做到"一个工具接多个模型"的

Claude Agent SDK 本质上是"驱动 Claude Code CLI"的 SDK,但 Claude Code CLI 支持把请求整体重定向到
任何**声称自己兼容 Anthropic Messages 协议**的端点(通过 `ANTHROPIC_BASE_URL` + 鉴权环境变量)。
DeepSeek 和 Moonshot(Kimi)都做了这样一层官方兼容端点,所以可以直接用 Claude Agent SDK 的自主
Agent 能力去驱动它们的模型——你拿到的不是"一问一答",而是一个会自己读文件、写代码、跑命令、
多轮纠错直到任务完成的完整 Agent,只是底层模型换成了 DeepSeek/Kimi。

## 支持哪些模型(如实说明,没有编造任何端点)

配置全部在 [`models.config.json`](./models.config.json) 里,已经预填好经过查证的真实官方接入参数:

| 友好名字 | 上游 | 官方接入方式 | 说明 |
|---|---|---|---|
| `deepseek-v4-pro` | DeepSeek | `https://api.deepseek.com/anthropic`,`x-api-key` 鉴权 | 官方 Anthropic 兼容端点,Opus 档位映射目标,适合最高质量单次产出 |
| `deepseek-v4-flash` | DeepSeek | 同上,`model: "deepseek-flash"` | 同一端点的 Flash 档位(官方默认回退模型),快、便宜,适合调研/头脑风暴/大批量任务 |
| `kimi` | Moonshot(Kimi) | `https://api.moonshot.cn/anthropic`,`Authorization: Bearer` 鉴权 | 官方 Anthropic 兼容端点(中国站)。国际站把 `baseURL` 换成 `https://api.moonshot.ai/anthropic` 即可,鉴权方式不变 |
| `gemini` | Google | **没有官方端点** | 见下方说明,需要你自备网关 |

**关于 Gemini 的如实说明**:查证下来,Google 官方**没有**为 Gemini 提供 Anthropic Messages 协议
兼容端点(不像 DeepSeek/Moonshot 那样)。市面上能找到的都是社区维护的转换代理(比如把 Anthropic
格式转成 Gemini 原生格式或 OpenAI 兼容格式再转发)。所以 `models.config.json` 里 `gemini` 这一项的
`baseURL`/`model` 是**空的**——在你自己搭一个这样的网关(比如自建 [LiteLLM](https://docs.litellm.ai/)
proxy,或任何等价方案)并把地址填进去之前,选这个模型会直接报错退出,**不会**假装有个官方地址静默
发过去。

模型 ID 会随官方迭代变化,建议定期核对:
- DeepSeek: <https://api-docs.deepseek.com/guides/anthropic_api>
- Kimi: <https://platform.kimi.com/docs/api/list-models>

## 安装

```bash
cd agent-fleet
npm install
```

## 配置

1. 复制密钥模板:
   ```bash
   cp .env.example .env
   ```
2. 打开 `.env`,填入你自己的真实 key(去哪个网站生成见 `.env.example` 里的注释)。
   `.env` 已经被仓库根目录的 `.gitignore` 排除,不会被提交。
3. 如果要加/改/删可用的模型,直接改 `models.config.json`——这个文件本身**不含任何密钥**,
   `apiKeyEnv` 字段只是"去读哪个环境变量",真实值永远只在 `.env` 里。
4. 用 `list-models` 检查配置和密钥状态(只显示 present/missing,绝不打印密钥本身):
   ```bash
   node bin/agent-fleet.mjs list-models
   ```

## 用法

### `run` — 跑单个任务

```bash
agent-fleet run --model <友好名字> --prompt "<任务描述>" [--cwd <目录>] [--json]
```

示例:

```bash
# 用 DeepSeek Flash 做一次调研/头脑风暴
node bin/agent-fleet.mjs run \
  --model deepseek-v4-flash \
  --prompt "帮我调研一下 XX 竞品有哪些定价策略,写一份简短总结"

# 用 Kimi 在指定项目目录里干活,输出结构化 JSON 方便脚本解析
node bin/agent-fleet.mjs run \
  --model kimi \
  --prompt "把这个目录下的 README 翻译成英文,直接改文件" \
  --cwd ~/some-project \
  --json
```

想同时跑多个不同模型的任务,最简单的办法就是开多个终端(或用 `&` 丢后台)各自 `run` 一次——Claude
Agent SDK 的设计就是"一个调用绑一个模型的独立进程",天然支持这样并发,不需要在单进程里做复杂的
多模型切换。

### `run-many` — 一次命令批量并发跑一批任务

```bash
agent-fleet run-many --config batch.json [--json]
```

`batch.json` 是一个数组,每一项 `{ model, prompt, cwd? }`:

```json
[
  { "model": "gemini", "prompt": "写一段产品介绍文案" },
  { "model": "deepseek-v4-flash", "prompt": "调研一下同类产品的定价策略" }
]
```

内部用 `Promise.allSettled` 真正并发执行,每个任务独立成败——一个任务失败不会影响其它任务,最后
把每个任务各自的结果按原始顺序一起返回。

### 常用选项

- `--max-turns <n>`:限制最大工具调用轮数,避免任务跑飞
- `--system-prompt <text>`:追加系统提示
- `--models-config <path>`:临时换一份配置文件(默认用包目录下的 `models.config.json`)
- `--json`:输出结构化 JSON(`ok`、`result`、`numTurns`、`totalCostUsd`、`sessionId` 等字段),方便被
  其他程序/脚本解析

## 验证情况(如实说明)

没有真实的 DeepSeek/Moonshot API key(也没有去别的项目"顺手"拿),所以**没有做过真实模型的端到端
验证**。已经做到的:

1. **代码能正常跑**:`--help`、`--version`、`list-models`、缺参数/缺密钥/未知模型等错误路径都手动
   跑过,报错信息清晰可操作。
2. **本地假上游端到端验证**(`test/smoke-test.mjs`,`npm run smoke-test`):自己起了一个模拟 Anthropic
   Messages 流式协议的本地 HTTP 服务器(`test/mock-anthropic-server.mjs`),配一个指向它的假模型,
   真跑一次完整的 `run` 和 `run-many`,断言:
   - CLI 真的把请求发到了配置里指定的 `baseURL`,而不是官方 Anthropic 端点
   - `x-api-key` 和 `Authorization: Bearer` 两种鉴权风格都按配置正确生效
   - `bypassPermissions` 权限模式下,SDK 真的跑完了一整个 `query()` 循环并产出最终 `result`
   - `run-many` 里两个不同模型的任务确实并发跑完,各自拿到正确的结果

   这条验证**不需要任何真实密钥**,`npm run smoke-test` 随时可以重跑。

3. **联调过程中发现并修复了一个真实的安全问题**:在"当前进程本身就是被另一个 Claude Code 会话
   启动的子进程"这种场景下实测发现,即使显式配置了第三方 `baseURL` + API key,请求最终仍然会带着
   宿主会话自己的 OAuth 登录凭据发出去,完全绕过了显式配置的第三方 key——根因是宿主进程环境变量里
   残留的 `CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH` 等"宿主自动帮子进程刷新登录态"的变量族。已经在
   `src/isolated-env.mjs` 里修好:每次调用前会先剥离所有 `CLAUDE_CODE_*` / `ANTHROPIC_*` 环境变量,
   再叠上这次任务真正要用的配置,并把 `settingSources` 限定为只加载目标工作目录自己的项目配置,
   不加载操作者本机的全局 `~/.claude/settings.json`(避免连带加载操作者个人的 hooks、MCP server)。
   对绝大多数直接在普通终端里用这个工具的人来说这个坑本来就不会碰到,但这层防御是免费的,而且能
   防止"把你电脑上其它凭据/配置意外发给 `models.config.json` 里配置的任意第三方地址"这类真实泄露
   风险。

## 接下来你需要做的事

1. 去 DeepSeek(<https://platform.deepseek.com>)和/或 Moonshot(<https://platform.moonshot.cn>)
   生成真实 API key,填进 `.env`。
2. 如果要用 Gemini,自己搭一个 Anthropic 兼容网关,把地址和它认的模型 ID 填进
   `models.config.json` 的 `gemini` 条目。
3. 手动跑一次真实调用确认端到端可用,比如:
   ```bash
   node bin/agent-fleet.mjs run --model deepseek-v4-flash --prompt "说一句你好" --json
   ```
4. 需要的话把 `bin/agent-fleet.mjs` 链接到 `PATH` 里(比如 `npm link`),这样就能直接敲
   `agent-fleet run ...`,不用带 `node bin/agent-fleet.mjs` 前缀。

## 安全边界

- 代码、配置模板、这份 README 里都没有写过任何真实 API key。
- `.env` 已被仓库 `.gitignore` 排除。
- `models.config.json` 本身允许提交进 git——它不含密钥,`apiKeyEnv` 只是变量名指针;如果有人不小心
  往里面直接写字面量 `apiKey`,`src/config.mjs` 加载时会直接拒绝并报错。
- `list-models` 只显示密钥状态(present/missing),从不打印密钥本身的值。
