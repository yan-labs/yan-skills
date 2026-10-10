// typesafe-systemone 协议(JEV / Typesafe System One)的直接调用路径。
//
// 为什么单独一个文件、不复用 run-task.mjs:JEV 不是"另一个可以被 Claude Agent SDK 驱动的
// 聊天模型",而是一个完全不同形状的 API——POST 一次,body 是 { state, model, questions },
// 回一次结构化答案(noul/choice/score),没有 messages 数组、没有工具调用、没有多轮。
// 把它硬塞进 runTask()/query() 的路径只会产出一个协议不匹配、语义不明的失败;所以这里
// 直接对 { baseURL } 发一次裸 HTTP POST,不经过 Claude Agent SDK。
//
// 安全姿势和 run-task.mjs 保持一致:密钥仍然只从 resolveModel()(config.mjs)解析而来
// ——models.config.json 里只放 apiKeyEnv 指针,真实值只在 .env / 进程环境里,这里不引入
// 任何新的密钥来源。

import { resolveModel, ConfigError } from './config.mjs';

const TYPES = 'noul|choice|score';
const EXAMPLE = '合法 questions.json 示例: {"is_urgent":{"type":"noul","instructions":"这条消息是否紧急？"}}';
const TYPE_HINTS = {
  boolean: 'noul', bool: 'noul', yesno: 'noul', yes_no: 'noul', binary: 'noul',
  enum: 'choice', select: 'choice', multiple_choice: 'choice',
  rating: 'score', number: 'score', scale: 'score',
};
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const hasContent = (value) => typeof value === 'string' ? value.trim().length > 0
  : (Array.isArray(value) || isObject(value)) && Object.keys(value).length > 0;

function validateQuestions(questions) {
  if (!isObject(questions) || Object.keys(questions).length === 0) {
    return `questions 必须是非空对象，收到 ${JSON.stringify(questions)}。允许的 type: ${TYPES}。${EXAMPLE}`;
  }
  for (const [key, question] of Object.entries(questions)) {
    const type = question?.type;
    const error = (detail) => `题目 ${JSON.stringify(key)}: ${detail}。允许的 type: ${TYPES}。${EXAMPLE}`;
    if (!isObject(question)) return error(`题目必须是对象，收到 ${JSON.stringify(question)}`);
    if (!['noul', 'choice', 'score'].includes(type)) {
      const hint = Object.hasOwn(TYPE_HINTS, type) ? `；请改用 ${TYPE_HINTS[type]}` : '';
      return error(`type ${JSON.stringify(type)} 无效${hint}`);
    }
    if (typeof question.instructions !== 'string' || !question.instructions.trim()) {
      return error(`instructions 必须是非空字符串，收到 ${JSON.stringify(question.instructions)}`);
    }
    if (type === 'choice') {
      const criteria = question.criteria;
      if (!isObject(criteria) || Object.keys(criteria).length === 0 || Object.keys(criteria).length > 255 ||
          Object.values(criteria).some((value) => value !== null && !hasContent(value))) {
        return error(`choice 的 criteria 必须是含 1–255 个选项的对象，选项说明须为非空文本或结构化内容（也可为 null），收到 ${JSON.stringify(criteria)}`);
      }
    }
    if (type === 'score') {
      const criteria = question.criteria;
      if (!Array.isArray(criteria) || criteria.length < 2 || criteria.length > 10 || criteria.some((value) => !hasContent(value))) {
        return error(`score 的 criteria 必须是含 2–10 个非空等级说明的数组，收到 ${JSON.stringify(criteria)}`);
      }
    }
  }
  return null;
}

/**
 * 调用一个 typesafe-systemone 协议的模型。
 *
 * @param {object} params
 * @param {string} params.friendlyModel  models.config.json 里的友好名字,如 "jev"
 * @param {string|object|Array} params.state      要评估的内容:纯文本,或结构化数据(对象/数组)
 * @param {Record<string, object>} params.questions  类型化问题的 map,见 README「JEV」一节的 schema
 * @param {object} params.config         已加载的 models.config.json
 * @returns {Promise<object>} 见文件底部的返回形状说明
 */
export async function judgeTask({ friendlyModel, state, questions, config, signal }) {
  const startedAt = Date.now();

  const questionsError = validateQuestions(questions);
  if (questionsError) return { ok: false, model: friendlyModel, error: questionsError, durationMs: Date.now() - startedAt };

  // 协议检查放在 resolveModel() 之前(用 config 里的原始条目直接看 protocol 字段):
  // 「用错命令」和「密钥没配」是两类不同的错误,前者应该无论密钥配没配都立刻、清楚地
  // 指出来,不应该被"环境变量 XXX_API_KEY 没设置"这种无关错误盖住——用户拿一个
  // anthropic-messages 协议的模型误跑 judge 时,大概率还没配过那个模型的 key。
  const def = config[friendlyModel];
  if (def && def.protocol !== 'typesafe-systemone') {
    const hint =
      def.protocol === 'anthropic-messages'
        ? `"${friendlyModel}" 是 anthropic-messages 协议(普通对话/Agent 模型),judge 命令只支持` +
          `typesafe-systemone 协议的模型,请改用 \`run\`/\`run-many\`。`
        : `"${friendlyModel}" 的 protocol("${def.protocol}")不是 judge 命令支持的 typesafe-systemone。`;
    return { ok: false, model: friendlyModel, error: hint, durationMs: Date.now() - startedAt };
  }

  let resolved;
  try {
    resolved = resolveModel(friendlyModel, config);
  } catch (err) {
    if (err instanceof ConfigError) {
      return { ok: false, model: friendlyModel, error: err.message, durationMs: Date.now() - startedAt };
    }
    throw err;
  }

  if (state === undefined || state === null || state === '') {
    return { ok: false, model: friendlyModel, error: '缺少 state(要评估的内容,不能为空)。', durationMs: Date.now() - startedAt };
  }
  const body = JSON.stringify({ state, model: resolved.model, questions });

  let res;
  try {
    res = await fetch(resolved.baseURL, {
      method: 'POST',
      signal,
      headers: {
        // typesafe-systemone 固定用裸 Authorization: Bearer <key>,不走
        // isolated-env.mjs 那套 x-api-key/auth-token 映射——那套映射是给
        // Claude Agent SDK 的上游用的,这里是直接 fetch,自己拼头。
        Authorization: `Bearer ${resolved.apiKey}`,
        'Content-Type': 'application/json',
        ...(resolved.headers ?? {}),
      },
      body,
    });
  } catch (err) {
    return {
      ok: false,
      model: friendlyModel,
      resolvedModel: resolved.model,
      baseURL: resolved.baseURL,
      error: `请求 ${resolved.baseURL} 失败: ${err.message}`,
      durationMs: Date.now() - startedAt,
    };
  }

  const text = await res.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // 上游返回了非 JSON 内容(比如网关错误页),原样透出 text 供排查。
  }

  if (!res.ok) {
    return {
      ok: false,
      model: friendlyModel,
      resolvedModel: resolved.model,
      baseURL: resolved.baseURL,
      httpStatus: res.status,
      errorObject: parsed,
      error: `上游返回 HTTP ${res.status}: ${parsed ? JSON.stringify(parsed) : text}`,
      durationMs: Date.now() - startedAt,
    };
  }

  return {
    ok: true,
    model: friendlyModel,
    resolvedModel: parsed?.model ?? resolved.model,
    baseURL: resolved.baseURL,
    httpStatus: res.status,
    answers: parsed?.answers ?? null,
    usage: parsed?.usage ?? null,
    durationMs: Date.now() - startedAt,
  };
}

/*
 * 返回形状(成功时):
 * {
 *   ok: true,
 *   model: "jev",                 友好名字
 *   resolvedModel: "jev-1.13.0",  上游实际返回的 model 字段(可能带具体版本号)
 *   baseURL: "https://api.typesafe.ai/v1/systemone",
 *   httpStatus: 200,
 *   answers: { <questionKey>: { type, ...noul/choice/score 字段 } },
 *   usage: { input_tokens, output_tokens },
 *   durationMs: 1234,
 * }
 *
 * 失败时至少有 { ok:false, model, error },配置/参数错误阶段没有 baseURL/httpStatus 等字段。
 */
