import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { startOpenAIBridge } from '../src/openai-bridge.mjs';

async function fixture(t) {
  const requests = [];
  let response = { status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] }], usage: { input_tokens: 12, output_tokens: 3, input_tokens_details: { cached_tokens: 4 } } };
  let status = 200;
  const upstream = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    requests.push({ path: req.url, auth: req.headers.authorization, body: JSON.parse(raw) });
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(response));
  });
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve));
  const bridge = await startOpenAIBridge({ baseURL: `http://127.0.0.1:${upstream.address().port}/v1`, apiKey: 'fake-upstream-secret', model: 'fixed-test-model', maxOutputTokens: 2048 });
  t.after(async () => { await bridge.close(); await new Promise(resolve => { upstream.close(resolve); upstream.closeAllConnections(); }); });
  const post = (body, path = '/v1/messages', headers = { 'x-api-key': bridge.apiKey }) => fetch(bridge.baseURL + path, { method: 'POST', headers, body: JSON.stringify(body) });
  return { bridge, requests, post, setResponse(value, code = 200) { response = value; status = code; } };
}
const basic = { messages: [{ role: 'user', content: 'hello' }], max_tokens: 100000 };

test('loopback auth, route isolation, query parameters and configured limits', async t => {
  const f = await fixture(t);
  assert.equal((await f.post(basic, '/v1/messages', {})).status, 401);
  assert.equal((await f.post(basic, '/responses')).status, 404);
  assert.equal((await fetch(f.bridge.baseURL + '/v1/messages', { headers: { 'x-api-key': f.bridge.apiKey } })).status, 404);
  const res = await f.post({ ...basic, model: 'attacker-model', baseURL: 'https://attacker.invalid' }, '/v1/messages?beta=true', { authorization: `Bearer ${f.bridge.apiKey}` });
  assert.equal(res.status, 200);
  const message = await res.json();
  assert.equal(message.stop_reason, 'end_turn');
  assert.equal(message.model, 'fixed-test-model');
  assert.deepEqual(message.usage, { input_tokens: 8, output_tokens: 3, cache_read_input_tokens: 4, cache_creation_input_tokens: 0 });
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].path, '/v1/responses');
  assert.equal(f.requests[0].auth, 'Bearer fake-upstream-secret');
  assert.equal(f.requests[0].body.model, 'fixed-test-model');
  assert.equal(f.requests[0].body.max_output_tokens, 2048);
  assert.equal(f.requests[0].body.store, false);
  assert.equal(f.requests[0].body.stream, false);
});

test('complete tool history, schema, images and multiple call IDs survive conversion', async t => {
  const f = await fixture(t);
  const schema = { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] };
  const body = { system: [{ type: 'text', text: 'system one' }, { type: 'text', text: 'system two' }], messages: [
    { role: 'user', content: [{ type: 'text', text: 'inspect' }, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'FAKE' } }] },
    { role: 'assistant', content: [{ type: 'text', text: 'looking' }, { type: 'tool_use', id: 'call_A', name: 'Read', input: { path: 'a' } }, { type: 'tool_use', id: 'call_B', name: 'Read', input: { path: 'b' } }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'call_A', content: 'file A' }, { type: 'tool_result', tool_use_id: 'call_B', content: [{ type: 'text', text: 'missing' }], is_error: true }, { type: 'text', text: 'continue' }] },
  ], tools: [{ name: 'Read', description: 'Read a file', input_schema: schema }], tool_choice: { type: 'auto', disable_parallel_tool_use: false } };
  f.setResponse({ status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'function_call', call_id: 'call_C', name: 'Read', arguments: '{"path":"c"}' }, { type: 'function_call', call_id: 'call_D', name: 'Read', arguments: '{"path":"d"}' }], usage: { input_tokens: 50, output_tokens: 20 } });
  const res = await f.post(body);
  const answer = await res.json();
  assert.equal(answer.stop_reason, 'tool_use');
  assert.deepEqual(answer.content.map(b => [b.id, b.input.path]), [['call_C', 'c'], ['call_D', 'd']]);
  const request = f.requests[0].body;
  assert.equal(request.instructions, 'system one\nsystem two');
  assert.deepEqual(request.tools, [{ type: 'function', name: 'Read', description: 'Read a file', parameters: schema, strict: false }]);
  assert.equal(request.parallel_tool_calls, true);
  assert.equal(request.input[0].content[1].image_url, 'data:image/png;base64,FAKE');
  assert.equal(request.input[1].content[0].type, 'output_text');
  assert.deepEqual(request.input.slice(2, 6).map(item => [item.type, item.call_id]), [['function_call', 'call_A'], ['function_call', 'call_B'], ['function_call_output', 'call_A'], ['function_call_output', 'call_B']]);
  assert.deepEqual(request.input[4].output, 'file A');
  assert.match(request.input[5].output[0].text, /failed/);
});

test('SSE is emitted after upstream completes and contains tool argument deltas', async t => {
  const f = await fixture(t);
  f.setResponse({ status: 'completed', output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'checking' }] }, { type: 'function_call', call_id: 'tool_1', name: 'Read', arguments: '{"path":"x"}' }], usage: { input_tokens: 2, output_tokens: 8 } });
  const res = await f.post({ ...basic, stream: true });
  assert.match(res.headers.get('content-type'), /event-stream/);
  const raw = await res.text();
  const events = raw.trim().split('\n\n').map(event => JSON.parse(event.split('\ndata: ')[1]));
  assert.deepEqual(events.map(e => e.type), ['message_start', 'content_block_start', 'content_block_delta', 'content_block_stop', 'content_block_start', 'content_block_delta', 'content_block_stop', 'message_delta', 'message_stop']);
  assert.equal(events[0].message.content.length, 0);
  assert.equal(events[4].content_block.id, 'tool_1');
  assert.deepEqual(JSON.parse(events[5].delta.partial_json), { path: 'x' });
  assert.equal(events[7].delta.stop_reason, 'tool_use');
  assert.equal(events[7].usage.output_tokens, 8);
});

test('unsupported content and tools explicitly fail before sending upstream', async t => {
  const f = await fixture(t);
  for (const block of [{ type: 'tool_reference', tool_name: 'Read' }, { type: 'document', source: {} }, { type: 'future_content' }]) {
    const res = await f.post({ messages: [{ role: 'user', content: [block] }] });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.message, 'unsupported_content');
  }
  for (const tool of [{ type: 'web_search_20250305', name: 'web_search' }, { name: 'Read', input_schema: {}, defer_loading: true }]) assert.equal((await f.post({ ...basic, tools: [tool] })).status, 400);
  assert.equal(f.requests.length, 0);
});

test('unsupported generation controls fail explicitly without an upstream call', async t => {
  const f = await fixture(t);
  for (const [option, code] of [
    [{ top_k: 5 }, 'unsupported_top_k'],
    [{ stop_sequences: ['stop'] }, 'unsupported_stop_sequences'],
    [{ output_config: { format: { type: 'json_schema' } } }, 'unsupported_request_option'],
  ]) {
    const res = await f.post({ ...basic, ...option });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.message, code);
  }
  assert.equal(f.requests.length, 0);
});

test('incomplete and failed responses are not reported as successful end_turn', async t => {
  const f = await fixture(t);
  f.setResponse({ status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' }, output: [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'partial' }] }] });
  assert.equal((await (await f.post(basic)).json()).stop_reason, 'max_tokens');
  for (const status of ['failed', 'cancelled', 'in_progress']) {
    f.setResponse({ status, output: [], error: { message: 'fake-upstream-secret provider detail' } });
    const res = await f.post({ ...basic, stream: true });
    assert.equal(res.status, 502);
    const raw = await res.text();
    assert.doesNotMatch(raw, /fake-upstream-secret|provider detail|end_turn/);
    assert.match(raw, /upstream_response_failed/);
  }
  f.setResponse({ status: 'incomplete', incomplete_details: { reason: 'content_filter' }, output: [] });
  assert.equal((await f.post(basic)).status, 502);
});

test('upstream error body and thrown fetch errors are never relayed', async t => {
  const f = await fixture(t);
  f.setResponse({ message: 'fake-upstream-secret sensitive-provider-body' }, 401);
  const res = await f.post(basic);
  assert.equal(res.status, 401);
  assert.doesNotMatch(await res.text(), /fake-upstream-secret|sensitive-provider-body/);
  const bridge = await startOpenAIBridge({ baseURL: 'https://api.openai.com/v1', apiKey: 'fake-private', model: 'fixed' }, { fetch() { throw new Error('fake-private raw secret'); } });
  t.after(() => bridge.close());
  const failed = await fetch(bridge.baseURL + '/v1/messages', { method: 'POST', headers: { 'x-api-key': bridge.apiKey }, body: JSON.stringify(basic) });
  assert.doesNotMatch(await failed.text(), /fake-private|raw secret/);
});

test('count uses official upstream input_tokens endpoint and close is idempotent', async t => {
  const f = await fixture(t);
  f.setResponse({ input_tokens: 173 });
  const res = await f.post(basic, '/v1/messages/count_tokens?beta=true');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { input_tokens: 173 });
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].path, '/v1/responses/input_tokens');
  assert.equal('max_output_tokens' in f.requests[0].body, false);
  await f.bridge.close();
  await f.bridge.close();
  await assert.rejects(fetch(f.bridge.baseURL));
});

test('close aborts pending upstream requests and releases the loopback server', async t => {
  let markStarted;
  const started = new Promise(resolve => { markStarted = resolve; });
  let aborted = false;
  const bridge = await startOpenAIBridge({ baseURL: 'https://api.openai.com/v1', apiKey: 'fake-private', model: 'fixed' }, {
    fetch(_url, { signal }) {
      markStarted();
      return new Promise((resolve, reject) => signal.addEventListener('abort', () => { aborted = true; reject(new Error('aborted')); }, { once: true }));
    },
  });
  t.after(() => bridge.close());
  const pending = fetch(bridge.baseURL + '/v1/messages', { method: 'POST', headers: { 'x-api-key': bridge.apiKey }, body: JSON.stringify(basic) }).catch(() => null);
  await started;
  await bridge.close();
  await pending;
  assert.equal(aborted, true);
  await assert.rejects(fetch(bridge.baseURL));
});

test('SDK system messages and thinking effort preserve role order and reasoning tier', async t => {
  const f = await fixture(t);
  const res = await f.post({ ...basic, messages: [...basic.messages, { role: 'system', content: [{ type: 'text', text: 'SDK injected context', cache_control: { type: 'ephemeral' } }] }, { role: 'developer', content: 'developer context' }], thinking: { type: 'adaptive', display: 'updates' }, output_config: { effort: 'max' } });
  assert.equal(res.status, 200);
  assert.deepEqual(f.requests[0].body.input.map(item => item.role), ['user', 'system', 'developer']);
  assert.deepEqual(f.requests[0].body.reasoning, { effort: 'xhigh' });
  assert.deepEqual(f.bridge.getUsage(), { requestCount: 1, inputTokens: 12, outputTokens: 3, cachedInputTokens: 4, reasoningOutputTokens: 0 });
  const copy = f.bridge.getUsage();
  copy.requestCount = 999;
  assert.equal(f.bridge.getUsage().requestCount, 1);
});

test('real Agent SDK executes Read and sends tool result back through bridge', { timeout: 30000 }, async t => {
  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  const { buildQueryOptions } = await import('../src/run-task.mjs');
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = await mkdtemp(join(tmpdir(), 'fleet-bridge-sdk-'));
  const file = join(cwd, 'fixture.txt');
  await writeFile(file, 'bridge SDK fixture');
  t.after(() => rm(cwd, { recursive: true, force: true }));
  const seen = [];
  let sawToolResult = false;
  const bridge = await startOpenAIBridge({ baseURL: 'https://api.openai.com/v1', apiKey: 'fake-never-sent', model: 'gpt-6.1-sol', maxOutputTokens: 16000 }, {
    async fetch(url, options) {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      const request = JSON.parse(options.body);
      seen.push(request);
      const toolResult = request.input.find(item => item.type === 'function_call_output' && item.call_id === 'call_sdk_read');
      let output;
      if (toolResult) {
        sawToolResult = true;
        assert.match(JSON.stringify(toolResult.output), /bridge SDK fixture/);
        output = [{ type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'SDK bridge complete' }] }];
      } else {
        assert.ok(request.tools.some(tool => tool.name === 'Read'));
        output = [{ type: 'function_call', call_id: 'call_sdk_read', name: 'Read', arguments: JSON.stringify({ file_path: file }) }];
      }
      return Response.json({ status: 'completed', output, usage: { input_tokens: 100, output_tokens: 10, output_tokens_details: { reasoning_tokens: 2 } } });
    },
  });
  t.after(() => bridge.close());
  const resolved = { model: 'gpt-6.1-sol', baseURL: bridge.baseURL, apiKey: bridge.apiKey, authHeader: 'x-api-key', headers: {}, maxOutputTokens: 16000 };
  const options = buildQueryOptions({ resolved, cwd, maxTurns: 3 });
  options.env.ENABLE_TOOL_SEARCH = 'false';
  options.tools = ['Read'];
  const q = query({ prompt: `Use Read to inspect ${file}, then report completion.`, options });
  t.after(() => q.close());
  let result;
  for await (const message of q) if (message.type === 'result') result = message;
  assert.equal(result?.is_error, false);
  assert.equal(result?.subtype, 'success');
  assert.equal(sawToolResult, true);
  assert.ok(seen.length >= 2);
  assert.ok(seen[0].input.some(item => item.role === 'system'));
  assert.equal(bridge.getUsage().requestCount, seen.length);
  assert.equal(bridge.getUsage().reasoningOutputTokens, seen.length * 2);
});

test('upstream HTTP status and allowlisted error code survive without sensitive prose', async t => {
  const f = await fixture(t);
  const cases = [[400, 'unsupported_parameter', 'invalid_request_error'], [401, 'invalid_api_key', 'authentication_error'], [403, 'insufficient_quota', 'permission_error'], [404, 'model_not_found', 'not_found_error'], [429, 'rate_limit_exceeded', 'rate_limit_error'], [429, 'credit_balance_exhausted', 'rate_limit_error'], [400, 'context_length_exceeded', 'invalid_request_error'], [500, 'fake-private-secret', 'api_error']];
  for (const [status, code, type] of cases) {
    f.setResponse({ error: { code, message: 'fake-upstream-secret sensitive-provider-body', param: 'secret-param', api_key: 'fake-private-key' } }, status);
    const res = await f.post(basic);
    assert.equal(res.status, status);
    const raw = await res.text();
    assert.doesNotMatch(raw, /fake-upstream-secret|sensitive-provider-body|secret-param|fake-private/);
    assert.deepEqual(JSON.parse(raw), { type: 'error', error: { type, message: code === 'fake-private-secret' ? 'upstream_http_error' : code } });
  }
  assert.equal(f.bridge.getUsage().requestCount, 0);
});
