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
  console.log(`模型映射桩通过：${count} 个网关配置，env/settings/本地请求均为 ${allowedModel}`);
} finally { await mock.close(); }
