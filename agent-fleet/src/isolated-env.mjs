// 构造「干净的」子进程环境:把当前进程的 env 拿来打底,但先剥离掉所有可能让
// Claude Agent SDK 悄悄绕过我们显式配置、改用别的凭据/别的上游的变量,再叠上
// 本次任务真正要用的 ANTHROPIC_BASE_URL + 鉴权变量。
//
// 【为什么必须做这一步 —— 真实踩过的坑】
// 开发这个工具时,在「本进程本身就是由某个 Claude Code 宿主(桌面客户端/CLI 会话)
// 启动的 agent」这种环境下实测发现:即使显式设置了 ANTHROPIC_BASE_URL 和
// ANTHROPIC_API_KEY 指向一个本地假上游,请求最终仍然带着宿主会话自己的
// `sk-ant-oat01-...` OAuth 登录态发了出去,完全没有用我们注入的假 key。
// 根因是宿主进程的环境变量里还留着 CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH /
// CLAUDE_CODE_MESSAGING_SOCKET / CLAUDE_CODE_MESSAGING_TOKEN 这类「宿主自动帮子
// 进程刷新登录态」的 IPC 通道变量——只要这些变量还在,子进程就会通过这条通道拿到
// 宿主自己的真实登录凭据,完全绕过我们显式传的 ANTHROPIC_API_KEY。
// 单独 delete env.ANTHROPIC_API_KEY 之类的做法不够,必须把这一整类
// `CLAUDE_CODE_*` 变量都清掉,才能保证这次调用只走我们明确配置的第三方端点+密钥,
// 不会静默把宿主环境里的真实凭据发给用户在 models.config.json 里填的任意 baseURL
// ——后者是真实的密钥泄露风险,不是单纯的功能 bug。
//
// 对绝大多数用户(直接在普通终端里跑这个 CLI,没有嵌套在另一个 Claude Code 会话里)
// 来说这些变量本来就不存在,这个函数是无操作的;只有在被嵌套调用、CI 环境或未来
// SDK 新增类似机制时才会真正生效,但防御性地做这件事没有下行风险。

/**
 * 需要从继承环境里剥离的变量名前缀 / 精确名。
 * 覆盖两类:(1) 官方 Anthropic 鉴权变量本身,防止旧值和我们要设置的新值混在一起;
 * (2) 任何 `CLAUDE_CODE_` 前缀变量,这是 Claude Code 宿主进程用来传递会话身份、
 * 权限令牌、IPC socket 地址的完整变量族,任何一个残留都可能让子进程重新"认出"
 * 自己身处宿主会话里,从而复用宿主的凭据或配置。
 */
const EXACT_KEYS_TO_STRIP = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'];
const PREFIX_TO_STRIP = 'CLAUDE_CODE_';

/**
 * 基于 process.env 构造一份干净的子进程环境。
 * @param {{ baseURL: string, apiKey: string, authHeader: 'x-api-key' | 'auth-token' }} resolved
 * @returns {Record<string, string>}
 */
export function buildIsolatedEnv(resolved) {
  const env = { ...process.env };

  for (const key of Object.keys(env)) {
    if (EXACT_KEYS_TO_STRIP.includes(key) || key.startsWith(PREFIX_TO_STRIP)) {
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

  return env;
}
