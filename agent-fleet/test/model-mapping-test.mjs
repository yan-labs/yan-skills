import assert from 'node:assert/strict';
import { loadModelsConfig, resolveModel } from '../src/config.mjs';
import { buildIsolatedEnv, buildPinnedSettings } from '../src/isolated-env.mjs';
import { startMockAnthropicServer } from './mock-anthropic-server.mjs';

const config = loadModelsConfig();
const mock = await startMockAnthropicServer();
let count = 0;
try {
  const allowedModel = config['kollab-gateway-deepseek'].model;
  assert.equal(allowedModel, 'deepseek-v4.1-flash');
  for (const [name, def] of Object.entries(config).filter(([name]) => name.startsWith('kollab-gateway-'))) {
    assert.equal(def.subagentModel, allowedModel, `${name} 子 agent 映射`);
    const localConfig = { [name]: { ...def, baseURL: mock.baseURL, apiKeyEnv: 'FLEET_MAPPING_MOCK_KEY', headerEnvs: undefined } };
    const saved = process.env.FLEET_MAPPING_MOCK_KEY;
    process.env.FLEET_MAPPING_MOCK_KEY = 'local-mock-only';
    try {
      const resolved = resolveModel(name, localConfig);
      const env = buildIsolatedEnv(resolved);
      const settings = buildPinnedSettings(resolved);
      assert.equal(env.CLAUDE_CODE_SUBAGENT_MODEL, 'sonnet');
      assert.equal(env.ANTHROPIC_DEFAULT_SONNET_MODEL, allowedModel);
      assert.equal(settings.env.ANTHROPIC_DEFAULT_SONNET_MODEL, allowedModel);
      const response = await fetch(`${mock.baseURL}/v1/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: env.ANTHROPIC_DEFAULT_SONNET_MODEL, messages: [{ role: 'user', content: 'mapping stub' }] }),
      });
      assert.equal(response.status, 200);
      await response.text();
      assert.equal(mock.receivedRequests.at(-1).body.model, allowedModel);
      count++;
    } finally {
      if (saved === undefined) delete process.env.FLEET_MAPPING_MOCK_KEY;
      else process.env.FLEET_MAPPING_MOCK_KEY = saved;
    }
  }
  assert.ok(count >= 5);
  // Claude 官方通道：用户级 key 没绑定工作区，必须带 anthropic-workspace-id 头，否则 400。
  const savedClaude = { key: process.env.ANTHROPIC_CREDIT_API_KEY, workspace: process.env.ANTHROPIC_WORKSPACE_ID };
  process.env.ANTHROPIC_CREDIT_API_KEY = 'local-mock-only';
  try {
    for (const name of ['claude-haiku', 'claude-sonnet', 'claude-opus', 'claude-fable']) {
      process.env.ANTHROPIC_WORKSPACE_ID = 'wrkspc_mockmockmockmockmockmock';
      const resolved = resolveModel(name, config);
      assert.equal(resolved.headers['anthropic-workspace-id'], 'wrkspc_mockmockmockmockmockmock', `${name} 带工作区头`);
      assert.match(buildIsolatedEnv(resolved).ANTHROPIC_CUSTOM_HEADERS, /^anthropic-workspace-id: wrkspc_mockmockmockmockmockmock$/m, `${name} 经 ANTHROPIC_CUSTOM_HEADERS 发给上游`);
      delete process.env.ANTHROPIC_WORKSPACE_ID;
      assert.throws(() => resolveModel(name, config), /ANTHROPIC_WORKSPACE_ID/, `${name} 缺工作区 ID 时给出可操作的报错`);
    }
  } finally {
    for (const [key, env] of [['key', 'ANTHROPIC_CREDIT_API_KEY'], ['workspace', 'ANTHROPIC_WORKSPACE_ID']]) {
      if (savedClaude[key] === undefined) delete process.env[env]; else process.env[env] = savedClaude[key];
    }
  }
  console.log(`模型映射桩通过：${count} 个网关配置，env/settings/本地请求均为 ${allowedModel}`);
} finally { await mock.close(); }

// Concrete old IDs below are compatibility fixtures, never dispatch defaults.
const { familyOf, isCodexModel, latestModel, resolveCodexModel, resolveApiModel } = await import('../src/model-family.mjs');
assert.equal(latestModel(['gpt-6.1-sol', 'gpt-6.2-sol', 'gpt-6.10-sol'], 'sol'), 'gpt-6.10-sol');
assert.equal(latestModel(['gpt-6.1-sol', 'gpt-6.2-sol'], 'sol'), 'gpt-6.2-sol');
assert.equal(familyOf('gpt-6.1-sol'), 'sol');
assert(isCodexModel('gpt-6.1-terra'));
let fallbackLog = '';
assert.equal(familyOf(resolveCodexModel('sol', { cachePath: '/nonexistent/model-cache', log: s => fallbackLog = s })), 'sol');
assert.match(fallbackLog, /fallback/);
for (const family of ['opus', 'sonnet', 'haiku', 'fable']) assert.equal(config[`claude-${family}`].model, family);
const api = { protocol: 'openai-responses', model: 'sol', fallbackModel: 'gpt-6.2-sol', baseURL: 'https://catalog.test/v1', apiKey: 'fixture' };
let calls = 0;
const fetchModels = async () => { calls++; return { ok: true, json: async () => ({ data: [{ id: 'gpt-6.1-sol' }, { id: 'gpt-6.2-sol' }] }) }; };
assert.equal((await resolveApiModel(api, { fetchModels })).model, 'gpt-6.2-sol');
await resolveApiModel(api, { fetchModels });
assert.equal(calls, 1);
assert.equal((await resolveApiModel({ ...api, baseURL: 'https://missing.test' }, { fetchModels: async () => { throw Error('offline'); }, log: () => {} })).model, api.fallbackModel);

const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
const { tmpdir } = await import('node:os');
const { join } = await import('node:path');
const temp = mkdtempSync(join(tmpdir(), 'fleet-model-family-'));
try {
  const cachePath = join(temp, 'models_cache.json');
  writeFileSync(cachePath, JSON.stringify({ models: [{ slug: 'gpt-6.1-sol' }, { slug: 'gpt-6.2-sol' }] }));
  assert.equal(resolveCodexModel('sol', { cachePath }), 'gpt-6.2-sol');
} finally { rmSync(temp, { recursive: true }); }
