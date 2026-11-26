import assert from 'node:assert/strict';
import { MODEL_ALIASES } from '../src/shortcuts.mjs';
import { executorOf } from '../src/ledger.mjs';
import { readFileSync } from 'node:fs';
assert.deepEqual([MODEL_ALIASES.copy, MODEL_ALIASES.bulk, MODEL_ALIASES.grok, MODEL_ALIASES.gpt], ['agy', 'agy', 'grok-cli:default', 'codex']);
assert.deepEqual(['haiku', 'sonnet', 'opus', 'fable'].map(x => MODEL_ALIASES[x]), ['claude-haiku', 'claude-sonnet', 'claude-opus', 'claude-fable']);
assert.deepEqual(['agy', 'grok-cli:default', MODEL_ALIASES.sonnet, 'kollab-gateway-gpt-sol'].map(executorOf), ['gemini-sub', 'grok', 'sonnet', 'openai-api']);
const config = JSON.parse(readFileSync(new URL('../models.config.json', import.meta.url)));
for (const name of ['haiku', 'sonnet', 'opus', 'fable']) {
  const model = config[MODEL_ALIASES[name]];
  assert.equal(model.baseURL, 'https://api.anthropic.com');
  assert.equal(model.apiKeyEnv, 'ANTHROPIC_CREDIT_API_KEY');
  assert.ok(!JSON.stringify(model).includes('kollab'));
}
console.log('PASS subscription routes and Claude official endpoint');
