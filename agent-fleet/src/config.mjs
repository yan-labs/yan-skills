// 模型配置的加载与校验。
//
// 真相源是 models.config.json:「友好名字」到「接入参数」的映射,不含任何真实密钥
// ——apiKeyEnv 只是一个指针,指向应该去读哪个环境变量,真实值来自 .env 或 shell export。
//
// 被 src/run-task.mjs(单任务执行)和 bin/agent-fleet.mjs(list-models 子命令)复用。

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const PKG_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/** 配置/密钥相关的用户可读错误。CLI 捕获后直接打印 message,不打印 stack。 */
export class ConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConfigError';
  }
}

/** 默认配置文件路径:包根目录下的 models.config.json。 */
export function defaultConfigPath() {
  return join(PKG_ROOT, 'models.config.json');
}

const VALID_AUTH_HEADERS = new Set(['x-api-key', 'auth-token', 'bearer-raw']);

/**
 * 支持的模型协议。
 *   - anthropic-messages(默认,不写这个字段就是它):上游实现 Anthropic Messages 协议,
 *     能被 Claude Agent SDK 的 query() 直接驱动——`run`/`run-many` 委派一整个自主任务
 *     给它,多轮读写文件、跑 bash、工具调用直到完成。
 *   - typesafe-systemone:Typesafe JEV/System One 的自有协议(POST {baseURL},
 *     body 是 { state, model, questions },不是 messages 数组)。这类模型**不生成文本、
 *     不支持多轮工具调用**,只接受一段 state + 若干类型化 questions(noul/choice/score),
 *     返回校准过的结构化判断——2026-09-25 用真实 API 调用验证过(见 README「JEV 验证记录」):
 *     `POST https://api.typesafe.ai/v1/messages` 返回 404,证实它完全没有实现 Anthropic
 *     Messages 协议,所以这类模型**不能**通过 run/run-many 委派任务,只能用 `judge` 子命令
 *     (见 src/judge-task.mjs)按它自己的协议调用。authHeader 固定用 `bearer-raw`,表示
 *     "judge 命令直接拼 `Authorization: Bearer <key>`",不走 isolated-env.mjs 那套
 *     Claude-Code-CLI 专用的 x-api-key/auth-token 环境变量映射(那套映射只对 Claude Agent
 *     SDK 的上游生效,typesafe-systemone 协议不经过 SDK,不需要也不应该套用它)。
 */
const VALID_PROTOCOLS = new Set(['anthropic-messages', 'typesafe-systemone']);

/** RFC 7230 的 header field-name 允许字符集。用来挡住带空格/冒号/换行的畸形头名。 */
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;
/** 环境变量名的常规写法。headerEnvs 的**值**必须是变量名,不是头的真实内容。 */
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
/**
 * 不允许由 headerEnvs 自定义的头名(大小写不敏感)。
 * 前两个由 authHeader + apiKeyEnv 这条链路唯一负责,放开会出现"两处都在设鉴权头、
 * 实际生效的是哪个说不清"的歧义;后几个由 CLI 自己按协议维护,覆盖只会制造难查的 bug。
 */
const RESERVED_HEADER_NAMES = new Set([
  'x-api-key',
  'authorization',
  'anthropic-version',
  'anthropic-beta',
  'content-type',
  'host',
]);

/**
 * 校验一条模型配置的自定义请求头声明。
 *
 * 【信任规则 —— 自定义头值一律按凭据对待】
 * 自定义头的典型用途是企业网关/第三方代理要求的额外认证口令(`X-Gateway-Auth: ...`),
 * 也就是说**头值本身常常就是一个密钥**。所以它适用和 apiKey 完全相同的规则:
 *   - 禁止在 models.config.json 里写字面量头值(这个文件会进 git);
 *   - 只能用 headerEnvs 做指针,`{ "头名": "环境变量名" }`,真实值只存在于 .env / shell;
 *   - 不可信来源(--cwd 目标目录的项目配置、继承来的宿主环境变量)永远不能成为头的来源
 *     ——前者由 src/project-trust.mjs 拒绝,后者由 src/isolated-env.mjs 剥离。
 *
 * @returns {Record<string, string>} 头名 -> 环境变量名
 */
function validateHeaderEnvs(name, def) {
  if ('headers' in def) {
    throw new ConfigError(
      `models.config.json 里的 "${name}" 用了字面量 headers。自定义请求头的值通常本身就是凭据` +
        `(网关口令之类),而这个文件会被提交进 git,禁止在这里放真实值。` +
        `请改用 headerEnvs: { "头名": "环境变量名" },真实值放 .env。`,
    );
  }

  const headerEnvs = def.headerEnvs;
  if (headerEnvs === undefined) return {};
  if (headerEnvs === null || typeof headerEnvs !== 'object' || Array.isArray(headerEnvs)) {
    throw new ConfigError(`models.config.json 里的 "${name}" 的 headerEnvs 必须是一个对象: { "头名": "环境变量名" }。`);
  }

  const result = {};
  for (const [headerName, envName] of Object.entries(headerEnvs)) {
    if (!HEADER_NAME_RE.test(headerName)) {
      throw new ConfigError(`models.config.json 里的 "${name}" 的 headerEnvs 含非法 HTTP 头名: "${headerName}"。`);
    }
    if (RESERVED_HEADER_NAMES.has(headerName.toLowerCase())) {
      throw new ConfigError(
        `models.config.json 里的 "${name}" 的 headerEnvs 试图自定义 "${headerName}",这个头由 authHeader/协议本身负责,不允许覆盖。`,
      );
    }
    if (typeof envName !== 'string' || !ENV_NAME_RE.test(envName)) {
      throw new ConfigError(
        `models.config.json 里的 "${name}" 的 headerEnvs["${headerName}"] 必须是一个环境变量名(例如 "MY_GATEWAY_TOKEN"),` +
          `而不是头的真实值——真实值只能放 .env。`,
      );
    }
    result[headerName] = envName;
  }
  return result;
}

/**
 * 校验单条模型配置。
 * 关键决策:如果配置里出现字面量 `apiKey`(而不是 `apiKeyEnv` 指针),直接拒绝加载。
 * 这是防止有人图省事把真实 key 直接写进这个会被提交进 git 的文件的最后一道闸门,
 * 比事后 review 才发现要可靠。同样的规则适用于自定义请求头,见 validateHeaderEnvs。
 */
function validateEntry(name, def) {
  if (def == null || typeof def !== 'object') {
    throw new ConfigError(`models.config.json 里的 "${name}" 不是一个对象。`);
  }
  if ('apiKey' in def) {
    throw new ConfigError(
      `models.config.json 里的 "${name}" 直接写了字面量 apiKey,这个文件会被提交进 git,` +
        `禁止在这里放真实密钥。请改用 apiKeyEnv 指向一个环境变量名,真实值放 .env。`,
    );
  }
  // apiKeyEnv 必须非空——它是密钥指针,少了这个字段整条配置就没法工作。
  if (typeof def.apiKeyEnv !== 'string' || def.apiKeyEnv.length === 0) {
    throw new ConfigError(`models.config.json 里的 "${name}" 缺少必填字段 "apiKeyEnv"。`);
  }
  // model 和 baseURL 允许是空字符串:像 gemini 这种「需要用户自备网关」的条目,
  // 加载/列出配置时应该能正常显示"还没填",而不是直接让整个配置文件加载失败。
  // 真正执行任务时(resolveModel)才会因为空值而拒绝跑。
  for (const field of ['model', 'baseURL']) {
    if (typeof def[field] !== 'string') {
      throw new ConfigError(`models.config.json 里的 "${name}" 缺少 "${field}" 字段(可以是空字符串,但字段必须存在)。`);
    }
  }
  const authHeader = def.authHeader ?? 'x-api-key';
  if (!VALID_AUTH_HEADERS.has(authHeader)) {
    throw new ConfigError(
      `models.config.json 里的 "${name}" 的 authHeader 只能是 ${[...VALID_AUTH_HEADERS].join(' / ')} 之一,当前是 "${authHeader}"。`,
    );
  }

  const protocol = def.protocol ?? 'anthropic-messages';
  if (!VALID_PROTOCOLS.has(protocol)) {
    throw new ConfigError(
      `models.config.json 里的 "${name}" 的 protocol 只能是 ${[...VALID_PROTOCOLS].join(' / ')} 之一,当前是 "${protocol}"。`,
    );
  }
  // typesafe-systemone 协议不经过 isolated-env.mjs 的 x-api-key/auth-token 映射
  // (那套映射是 Claude Agent SDK 专用的),强制用 bearer-raw 避免有人以为配了
  // x-api-key/auth-token 就能拿去跑 run/run-many。
  if (protocol === 'typesafe-systemone' && authHeader !== 'bearer-raw') {
    throw new ConfigError(
      `models.config.json 里的 "${name}" protocol 是 "typesafe-systemone",authHeader 必须是 "bearer-raw",当前是 "${authHeader}"。`,
    );
  }

  return {
    name,
    description: def.description ?? '',
    baseURL: def.baseURL,
    model: def.model,
    apiKeyEnv: def.apiKeyEnv,
    authHeader,
    protocol,
    headerEnvs: validateHeaderEnvs(name, def),
    requiresGateway: Boolean(def.requiresGateway),
  };
}

/**
 * 读取并校验 models.config.json,返回 { 友好名字: 已校验配置 } 的映射。
 * 以 `$` 开头的顶层字段(比如 `$comment`)当元信息跳过,不当模型条目校验。
 */
export function loadModelsConfig(configPath = defaultConfigPath()) {
  if (!existsSync(configPath)) {
    throw new ConfigError(
      `找不到模型配置文件: ${configPath}\n` +
        `如果你是从别处复制了这个工具,确认 models.config.json 和 bin/、src/ 在同一个包目录下。`,
    );
  }

  let raw;
  try {
    raw = JSON.parse(readFileSync(configPath, 'utf8'));
  } catch (err) {
    throw new ConfigError(`models.config.json 不是合法 JSON: ${err.message}`);
  }

  const entries = {};
  for (const [name, def] of Object.entries(raw)) {
    if (name.startsWith('$')) continue;
    entries[name] = validateEntry(name, def);
  }
  return entries;
}

/**
 * 把「友好名字」解析成可以直接喂给 Claude Agent SDK 的完整参数,包括从环境变量里
 * 取出的真实 API key。找不到模型、缺 baseURL(尤其是 gemini 这种需要自备网关但还没
 * 填的情况)、或对应环境变量没设置时,都在这里直接报出可操作的错误,而不是让 SDK
 * 拿着一个空字符串 baseURL 发出一个必然失败、且报错信息对用户不友好的请求。
 */
export function resolveModel(friendlyName, config) {
  const def = config[friendlyName];
  if (!def) {
    const available = Object.keys(config).join(', ') || '(空——models.config.json 里没有任何模型条目)';
    throw new ConfigError(`未知模型 "${friendlyName}"。当前 models.config.json 里可用的模型: ${available}`);
  }

  if (!def.baseURL || !def.model) {
    const hint = def.requiresGateway
      ? `"${friendlyName}" 需要你自备一个 Anthropic 兼容网关:把网关地址填进 models.config.json 对应条目的 baseURL 字段、把网关认的模型 ID 填进 model 字段后再用。详见该条目的 description 和 README。`
      : `models.config.json 里 "${friendlyName}" 的 baseURL 或 model 是空的,请先补齐。`;
    throw new ConfigError(hint);
  }

  const apiKey = process.env[def.apiKeyEnv];
  if (!apiKey) {
    throw new ConfigError(
      `环境变量 ${def.apiKeyEnv} 没有设置(models.config.json 里 "${friendlyName}" 的 apiKeyEnv 指向它)。\n` +
        `把真实 key 填进 .env 里的这一行,或者在当前 shell 里 export ${def.apiKeyEnv}=...`,
    );
  }

  // 自定义头的真实值在这里才从环境变量取出。缺变量时和缺 apiKey 一样直接报错退出,
  // 而不是"少发一个头"静默继续——网关少了认证头只会回一个语义不明的 4xx,对用户更难排查。
  const headers = {};
  for (const [headerName, envName] of Object.entries(def.headerEnvs ?? {})) {
    const value = process.env[envName];
    if (!value) {
      throw new ConfigError(
        `环境变量 ${envName} 没有设置(models.config.json 里 "${friendlyName}" 的 headerEnvs["${headerName}"] 指向它)。\n` +
          `把真实值填进 .env 里的这一行,或者在当前 shell 里 export ${envName}=...`,
      );
    }
    // 头值里带 CR/LF 就能往请求里多塞一整行头(header injection),而且 Claude Code 的
    // ANTHROPIC_CUSTOM_HEADERS 本身就是按换行分隔多个头的,这里必须挡死。
    if (/[\r\n]/.test(value)) {
      throw new ConfigError(
        `环境变量 ${envName} 的值里含换行符,不能用作 HTTP 头值(会造成请求头注入)。请检查 .env 里这一行。`,
      );
    }
    headers[headerName] = value;
  }

  return { ...def, apiKey, headers };
}
