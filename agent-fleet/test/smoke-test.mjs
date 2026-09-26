#!/usr/bin/env node
// 端到端冒烟测试:不需要任何真实的第三方模型 API key。
//
// 流程:起一个本地假 Anthropic 兼容服务器(mock-anthropic-server.mjs)-> 生成一份
// 指向它的临时 models.config.json -> 用子进程真正跑一次 `agent-fleet run` -> 断言
// CLI 确实把请求发到了这个本地假上游、确实用 bypassPermissions 跑完了一整个 query()
// 循环、确实把假上游返回的文本落地成了最终 result。
//
// 验证的是「代码链路打通」,不是「某个真实模型好不好用」——mock 服务器对请求内容
// 完全不理解,只按协议格式回一段固定文本。

import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startMockAnthropicServer, FIXED_REPLY_TEXT } from './mock-anthropic-server.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI_PATH = join(HERE, '..', 'bin', 'agent-fleet.mjs');

const FAKE_API_KEY = 'mock-secret-value-not-a-real-credential';

function runCli(args, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [CLI_PATH, ...args], { env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolvePromise({ code, stdout, stderr }));
  });
}

async function main() {
  const failures = [];
  const assert = (cond, message) => {
    if (!cond) failures.push(message);
    console.log(`${cond ? 'PASS' : 'FAIL'} - ${message}`);
  };

  const server = await startMockAnthropicServer();
  console.log(`本地假上游已启动: ${server.baseURL}`);

  // 独立临时目录:验证过程会以 bypassPermissions 跑真实的 Agent 循环,即使上游是假的,
  // 也不应该让它在这个项目目录或用户真实文件系统里乱跑,所以工作目录严格限定在一次性
  // 的 mktemp 目录里。
  const scratchCwd = mkdtempSync(join(tmpdir(), 'agent-fleet-smoke-'));
  const configPath = join(scratchCwd, 'mock-models.config.json');
  writeFileSync(
    configPath,
    JSON.stringify(
      {
        mock: {
          description: '仅用于 smoke test 的本地假上游,不是真实模型。',
          baseURL: server.baseURL,
          model: 'mock-model',
          apiKeyEnv: 'MOCK_API_KEY',
          authHeader: 'x-api-key',
        },
      },
      null,
      2,
    ),
  );

  try {
    const { code, stdout, stderr } = await runCli(
      [
        'run',
        '--model',
        'mock',
        '--prompt',
        'This is a smoke test prompt. Just say hello, do not use any tools.',
        '--cwd',
        scratchCwd,
        '--models-config',
        configPath,
        '--max-turns',
        '4',
        '--json',
      ],
      { ...process.env, MOCK_API_KEY: FAKE_API_KEY },
    );

    console.log(`\n--- CLI stdout ---\n${stdout}`);
    if (stderr) console.log(`--- CLI stderr ---\n${stderr}`);

    let parsed = null;
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      failures.push(`CLI 的 --json 输出不是合法 JSON: ${err.message}`);
    }

    assert(code === 0, `CLI 进程退出码为 0(实际: ${code})`);
    assert(parsed?.ok === true, `结果 ok === true(实际: ${JSON.stringify(parsed?.ok)})`);
    assert(
      typeof parsed?.result === 'string' && parsed.result.includes(FIXED_REPLY_TEXT),
      '最终 result 文本包含 mock 服务器返回的固定文本',
    );
    assert(parsed?.stopReason === 'end_turn', `stopReason 是 end_turn(实际: ${parsed?.stopReason}）`);

    const messagesRequests = server.receivedRequests.filter((r) => r.url?.startsWith('/v1/messages') && !r.url.includes('count_tokens'));
    assert(messagesRequests.length >= 1, `mock 服务器至少收到 1 次 /v1/messages 请求(实际: ${messagesRequests.length}）`);

    if (messagesRequests.length > 0) {
      const first = messagesRequests[0];
      assert(first.headers['x-api-key'] === FAKE_API_KEY, 'CLI 用 x-api-key 头发送了 apiKeyEnv 里配置的密钥,而不是官方 ANTHROPIC_API_KEY');
      assert(first.body?.stream === true, '请求体里 stream === true(确认走的是流式协议路径)');
      // 默认执行者系统提示用 preset+append 叠加(见 src/run-task.mjs 的 DEFAULT_EXECUTOR_SYSTEM_PROMPT),
      // 这里用真实发出的请求体确认它确实被发到了上游,而不是只在单元测试里断言函数返回值。
      assert(
        JSON.stringify(first.body?.system ?? '').includes('agent-fleet 自己'),
        '真实请求的 system 字段里包含默认追加的执行者系统提示(preset+append 生效,没有被替换或丢失)',
      );
    }
  } finally {
    await server.close();
    rmSync(scratchCwd, { recursive: true, force: true });
  }

  // 第二阶段:run-many。用同一个假上游验证两件事——(1) 一个 batch 文件里的多个任务
  // 真的会并发跑完并各自拿到结果;(2) authHeader: "x-api-key" 和 "auth-token" 两种
  // 鉴权风格分别对应 x-api-key 头和 Authorization: Bearer 头,互不串味。
  await runManyPhase(assert);

  console.log(`\n${'='.repeat(60)}`);
  if (failures.length === 0) {
    console.log('全部通过:agent-fleet 的读配置 -> 起 SDK -> bypassPermissions -> 发请求 -> 收流式响应 -> 落地 result 这条链路在代码层面打通了。');
    process.exit(0);
  } else {
    console.log(`有 ${failures.length} 项失败:`);
    failures.forEach((f) => console.log(`  - ${f}`));
    process.exit(1);
  }
}

async function runManyPhase(assert) {
  const server = await startMockAnthropicServer();
  const scratchCwd = mkdtempSync(join(tmpdir(), 'agent-fleet-smoke-many-'));
  const configPath = join(scratchCwd, 'mock-models.config.json');
  const batchPath = join(scratchCwd, 'batch.json');

  writeFileSync(
    configPath,
    JSON.stringify(
      {
        'mock-apikey-style': {
          baseURL: server.baseURL,
          model: 'mock-model-a',
          apiKeyEnv: 'MOCK_API_KEY_A',
          authHeader: 'x-api-key',
        },
        'mock-authtoken-style': {
          baseURL: server.baseURL,
          model: 'mock-model-b',
          apiKeyEnv: 'MOCK_API_KEY_B',
          authHeader: 'auth-token',
        },
      },
      null,
      2,
    ),
  );

  writeFileSync(
    batchPath,
    JSON.stringify(
      [
        { model: 'mock-apikey-style', prompt: 'task A, no tools please' },
        { model: 'mock-authtoken-style', prompt: 'task B, no tools please' },
      ],
      null,
      2,
    ),
  );

  try {
    const { code, stdout } = await runCli(
      ['run-many', '--config', batchPath, '--cwd', scratchCwd, '--models-config', configPath, '--json'],
      { ...process.env, MOCK_API_KEY_A: 'fake-key-a', MOCK_API_KEY_B: 'fake-key-b' },
    );

    let parsed = null;
    try {
      parsed = JSON.parse(stdout);
    } catch (err) {
      assert(false, `run-many --json 输出不是合法 JSON: ${err.message}`);
      return;
    }

    assert(code === 0, `run-many 进程退出码为 0(实际: ${code})`);
    assert(Array.isArray(parsed) && parsed.length === 2, `run-many 返回两个任务各自的结果(实际长度: ${parsed?.length}）`);
    assert(parsed?.every((r) => r.ok), 'run-many 里两个任务都成功');

    const messagesRequests = server.receivedRequests.filter((r) => r.url?.startsWith('/v1/messages') && !r.url.includes('count_tokens'));
    const usedApiKeyHeader = messagesRequests.some((r) => r.headers['x-api-key'] === 'fake-key-a');
    const usedAuthTokenHeader = messagesRequests.some((r) => r.headers['authorization'] === 'Bearer fake-key-b');
    assert(usedApiKeyHeader, 'run-many 里 authHeader:"x-api-key" 的任务确实用 x-api-key 头带了对应密钥');
    assert(usedAuthTokenHeader, 'run-many 里 authHeader:"auth-token" 的任务确实用 Authorization: Bearer 头带了对应密钥');
  } finally {
    await server.close();
    rmSync(scratchCwd, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('smoke test 自身抛出异常:', err);
  process.exit(1);
});
