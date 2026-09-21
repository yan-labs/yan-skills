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

const VALID_AUTH_HEADERS = new Set(['x-api-key', 'auth-token']);

/**
 * 校验单条模型配置。
 * 关键决策:如果配置里出现字面量 `apiKey`(而不是 `apiKeyEnv` 指针),直接拒绝加载。
 * 这是防止有人图省事把真实 key 直接写进这个会被提交进 git 的文件的最后一道闸门,
 * 比事后 review 才发现要可靠。
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
  return {
    name,
    description: def.description ?? '',
    baseURL: def.baseURL,
    model: def.model,
    apiKeyEnv: def.apiKeyEnv,
    authHeader,
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

  return { ...def, apiKey };
}
