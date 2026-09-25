// 批量并发执行:一次读入一个「任务数组」,每个任务可以指定不同的模型,内部用
// Promise.allSettled 真正并发跑完,再把每个任务各自的结果按原始顺序收集回来。
//
// 存在的意义:Claude Agent SDK 的设计是「一个 query() 调用绑一个模型」,天然支持
// 用多个独立调用实现并发,不需要在单进程里做复杂的多模型切换。run-many 只是把
// 「起 N 个独立 runTask() 调用」这件事包成一次命令,方便一次性派发一批不同模型的任务
// (比如同时起一个 Gemini 写文案、一个 DeepSeek 做调研),而不用手动开好几个后台进程。
//
// 被 bin/agent-fleet.mjs 的 `run-many` 子命令调用。

import { runTask } from './run-task.mjs';
import { createProgress } from './progress.mjs';

/**
 * 校验一份 batch 任务数组的形状,提前把明显错误的条目挡在真正发起 SDK 调用之前。
 * 只校验「结构对不对」,不校验模型名/密钥是否有效——那些交给 runTask 内部的
 * resolveModel 去判,错误信息会挂在对应任务的结果上,不会拖累其它任务。
 */
function validateBatch(tasks) {
  if (!Array.isArray(tasks)) {
    throw new TypeError('batch 文件的顶层必须是一个数组,每一项是 { model, prompt, cwd? }。');
  }
  tasks.forEach((task, index) => {
    if (typeof task?.model !== 'string' || task.model.length === 0) {
      throw new TypeError(`batch[${index}] 缺少必填字符串字段 "model"。`);
    }
    if (typeof task?.prompt !== 'string' || task.prompt.length === 0) {
      throw new TypeError(`batch[${index}] 缺少必填字符串字段 "prompt"。`);
    }
  });
}

/**
 * 并发执行一批任务。每个任务独立成败,一个任务的异常不会中断其它任务
 * ——这也是为什么用 allSettled 而不是 all:批处理场景里,"部分任务失败"
 * 应该在最终结果里如实体现,而不是让整批调用直接 reject。
 *
 * @param {Array<{model:string, prompt:string, cwd?:string, maxTurns?:number, systemPrompt?:string}>} tasks
 * @param {object} options
 * @param {object} options.config    已加载的 models.config.json
 * @param {string} options.defaultCwd 任务没指定 cwd 时的默认工作目录
 * @param {boolean} [options.quiet]  true 时不把进度打到 stderr,日志文件照写
 * @returns {Promise<Array<object>>} 与输入数组一一对应、顺序不变的结果数组
 */
export async function runMany(tasks, { config, defaultCwd, quiet = false }) {
  validateBatch(tasks);

  const settled = await Promise.allSettled(
    tasks.map((task, index) =>
      runTask({
        friendlyModel: task.model,
        prompt: task.prompt,
        cwd: task.cwd ?? defaultCwd,
        config,
        maxTurns: task.maxTurns,
        systemPrompt: task.systemPrompt,
        // label 用「#序号-模型名」:并发时每个任务各写各的日志文件,tail/人工翻找都好认。
        // runTask 的 finally 会 stop 掉各自的心跳定时器,不会泄漏。
        progress: createProgress({ quiet, label: `#${index + 1}-${task.model}` }),
      }),
    ),
  );

  // runTask 本身已经把已知错误(配置错误、SDK 异常)收敛成 { ok:false, error }
  // 形状返回,理论上不会走到 reject 分支;这里兜底处理是为了防御 runTask 之外
  // 未预见的同步异常(比如 batch 条目本身是畸形对象导致属性访问抛错)。
  return settled.map((outcome, index) =>
    outcome.status === 'fulfilled'
      ? outcome.value
      : { ok: false, model: tasks[index]?.model, prompt: tasks[index]?.prompt, error: String(outcome.reason?.message ?? outcome.reason) },
  );
}
