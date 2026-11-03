// Per-run, loopback-only Anthropic Messages → OpenAI Responses adapter.
// No tool execution happens here; the Agent SDK owns the tool loop.
import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';

class BridgeError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
const fail = (code = 'unsupported_request') => { throw new BridgeError(code); };
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const string = value => typeof value === 'string' ? value : fail('invalid_request');
function textBlocks(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return fail('invalid_request');
  return value.map(block => block?.type === 'text' ? string(block.text) : fail('unsupported_content')).join('\n');
}
function image(block) {
  const source = block.source;
  if (source?.type === 'base64' && /^image\/(png|jpeg|gif|webp)$/.test(source.media_type)) {
    return { type: 'input_image', image_url: `data:${source.media_type};base64,${string(source.data)}` };
  }
  if (source?.type === 'url' && /^https?:\/\//.test(source.url)) return { type: 'input_image', image_url: source.url };
  return fail('unsupported_image');
}
function toolOutput(value) {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value)) return fail('invalid_request');
  return value.map(block => block?.type === 'text'
    ? { type: 'input_text', text: string(block.text) }
    : block?.type === 'image' ? image(block) : fail('unsupported_tool_result'));
}
function convertRequest(body, resolved) {
  if (!object(body) || !Array.isArray(body.messages)) return fail('invalid_request');
  const input = [];
  for (const message of body.messages) {
    if (!['user', 'assistant', 'system', 'developer'].includes(message?.role)) return fail('unsupported_role');
    const blocks = typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content;
    if (!Array.isArray(blocks)) return fail('invalid_request');
    let pending = [];
    const flush = () => { if (pending.length) input.push({ role: message.role, content: pending }); pending = []; };
    for (const block of blocks) {
      if (block?.type === 'text') pending.push({ type: message.role === 'assistant' ? 'output_text' : 'input_text', text: string(block.text) });
      else if (block?.type === 'image' && message.role === 'user') pending.push(image(block));
      else if (block?.type === 'tool_use' && message.role === 'assistant') {
        flush();
        if (!object(block.input)) return fail('invalid_tool_input');
        input.push({ type: 'function_call', call_id: string(block.id), name: string(block.name), arguments: JSON.stringify(block.input) });
      } else if (block?.type === 'tool_result' && message.role === 'user') {
        flush();
        let output = toolOutput(block.content ?? '');
        // Preserve failed tool execution explicitly for the model.
        if (block.is_error) output = typeof output === 'string' ? `Tool execution failed:\n${output}` : [{ type: 'input_text', text: 'Tool execution failed:' }, ...output];
        input.push({ type: 'function_call_output', call_id: string(block.tool_use_id), output });
      } else return fail('unsupported_content');
    }
    flush();
  }
  if (body.tools !== undefined && !Array.isArray(body.tools)) return fail('invalid_request');
  const tools = (body.tools ?? []).map(tool => {
    if (!object(tool) || (tool.type && tool.type !== 'custom') || tool.defer_loading) return fail('unsupported_tool');
    if (!object(tool.input_schema)) return fail('invalid_tool_schema');
    return { type: 'function', name: string(tool.name), ...(tool.description !== undefined ? { description: string(tool.description) } : {}), parameters: tool.input_schema, strict: false };
  });
  const result = { model: resolved.model, input, store: false, stream: false,
    max_output_tokens: Math.min(Number.isInteger(body.max_tokens) && body.max_tokens > 0 ? body.max_tokens : resolved.maxOutputTokens ?? 16384, resolved.maxOutputTokens ?? 16384) };
  if (body.system !== undefined) result.instructions = textBlocks(body.system);
  if (tools.length) result.tools = tools;
  if (body.tool_choice) {
    const choice = body.tool_choice;
    if (choice.type === 'auto') result.tool_choice = 'auto';
    else if (choice.type === 'any') result.tool_choice = 'required';
    else if (choice.type === 'none') result.tool_choice = 'none';
    else if (choice.type === 'tool') result.tool_choice = { type: 'function', name: string(choice.name) };
    else return fail('unsupported_tool_choice');
    if (choice.disable_parallel_tool_use !== undefined) result.parallel_tool_calls = !choice.disable_parallel_tool_use;
  }
  if (body.top_k !== undefined) return fail('unsupported_top_k');
  if (body.stop_sequences?.length) return fail('unsupported_stop_sequences');
  if (body.output_config?.format) return fail('unsupported_request_option');
  // The SDK currently sends adaptive thinking and an effort tier. Preserve the
  // tier in OpenAI's vocabulary; no hidden reasoning is exposed to the SDK.
  if (body.thinking && !['disabled', 'enabled', 'adaptive'].includes(body.thinking.type)) return fail('unsupported_request_option');
  const effort = body.output_config?.effort;
  if (effort !== undefined && !['low', 'medium', 'high', 'max'].includes(effort)) return fail('unsupported_request_option');
  if (body.thinking?.type === 'disabled') result.reasoning = { effort: 'none' };
  else if (effort !== undefined) result.reasoning = { effort: effort === 'max' ? 'xhigh' : effort };
  else if (body.thinking?.type === 'enabled') result.reasoning = { effort: 'high' };
  return result;
}
function convertResponse(response, model) {
  if (!object(response) || !Array.isArray(response.output)) throw new BridgeError('invalid_upstream_response', 502);
  if (response.status !== 'completed' && !(response.status === 'incomplete' && response.incomplete_details?.reason === 'max_output_tokens')) {
    throw new BridgeError('upstream_response_failed', 502);
  }
  const content = [];
  for (const item of response.output) {
    if (item.type === 'message' && item.role === 'assistant') {
      for (const block of item.content ?? []) {
        if (block.type === 'output_text') content.push({ type: 'text', text: string(block.text) });
        else if (block.type === 'refusal') content.push({ type: 'text', text: string(block.refusal) });
        else throw new BridgeError('unsupported_upstream_content', 502);
      }
    } else if (item.type === 'function_call') {
      let args;
      try { args = JSON.parse(item.arguments); } catch { throw new BridgeError('invalid_upstream_tool_input', 502); }
      if (!object(args) || !item.call_id || !item.name) throw new BridgeError('invalid_upstream_tool_input', 502);
      content.push({ type: 'tool_use', id: item.call_id, name: item.name, input: args });
    } else if (item.type !== 'reasoning') throw new BridgeError('unsupported_upstream_content', 502);
  }
  const cached = response.usage?.input_tokens_details?.cached_tokens ?? 0;
  return { id: `msg_${randomBytes(12).toString('hex')}`, type: 'message', role: 'assistant', model, content,
    stop_reason: response.status === 'incomplete' ? 'max_tokens' : content.some(block => block.type === 'tool_use') ? 'tool_use' : 'end_turn', stop_sequence: null,
    usage: { input_tokens: Math.max(0, (response.usage?.input_tokens ?? 0) - cached), output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_input_tokens: cached, cache_creation_input_tokens: 0 } };
}
function sendSSE(res, message) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
  const event = (type, value) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`);
  event('message_start', { message: { ...message, content: [], stop_reason: null, usage: { ...message.usage, output_tokens: 0 } } });
  message.content.forEach((block, index) => {
    event('content_block_start', { index, content_block: block.type === 'text' ? { type: 'text', text: '' } : { ...block, input: {} } });
    event('content_block_delta', { index, delta: block.type === 'text' ? { type: 'text_delta', text: block.text } : { type: 'input_json_delta', partial_json: JSON.stringify(block.input) } });
    event('content_block_stop', { index });
  });
  event('message_delta', { delta: { stop_reason: message.stop_reason, stop_sequence: null }, usage: message.usage });
  event('message_stop', {});
  res.end();
}
const SAFE_UPSTREAM_CODES = new Set(['credit_balance_exhausted', 'insufficient_quota', 'rate_limit_exceeded', 'invalid_api_key', 'model_not_found', 'unsupported_parameter', 'context_length_exceeded']);
function errorType(status) {
  if (status === 400 || status === 422) return 'invalid_request_error';
  if (status === 401) return 'authentication_error';
  if (status === 403) return 'permission_error';
  if (status === 404) return 'not_found_error';
  if (status === 413) return 'request_too_large';
  if (status === 429) return 'rate_limit_error';
  if (status === 529) return 'overloaded_error';
  return 'api_error';
}
function json(res, status, value) { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(value)); }

/** fetch injection is only for isolated tests; resolved settings are trusted run configuration. */
export async function startOpenAIBridge(resolved, { fetch: fetchImpl = globalThis.fetch } = {}) {
  const apiKey = randomBytes(32).toString('hex');
  const upstreamURL = `${resolved.baseURL.replace(/\/+$/, '')}/responses`;
  const controllers = new Set();
  const usage = { requestCount: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, reasoningOutputTokens: 0 };
  const server = createServer(async (req, res) => {
    const supplied = req.headers['x-api-key'] ?? req.headers.authorization?.replace(/^Bearer /, '');
    const valid = typeof supplied === 'string' && Buffer.byteLength(supplied) === Buffer.byteLength(apiKey) && timingSafeEqual(Buffer.from(supplied), Buffer.from(apiKey));
    if (!valid) return json(res, 401, { type: 'error', error: { type: 'authentication_error', message: 'invalid_local_auth' } });
    const path = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method !== 'POST' || !['/v1/messages', '/v1/messages/count_tokens'].includes(path)) return json(res, 404, { type: 'error', error: { type: 'invalid_request_error', message: 'unsupported_route' } });
    const controller = new AbortController();
    controllers.add(controller);
    const timer = setTimeout(() => controller.abort(), 300000);
    timer.unref();
    res.on('close', () => { if (!res.writableEnded) controller.abort(); });
    try {
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (Buffer.byteLength(raw) > 32 * 1024 * 1024) throw new BridgeError('request_too_large', 413); }
      let body;
      try { body = JSON.parse(raw); } catch { throw new BridgeError('invalid_json'); }
      const request = convertRequest(body, resolved);
      const counting = path.endsWith('/count_tokens');
      const payload = counting ? Object.fromEntries(Object.entries(request).filter(([key]) => !['store', 'stream', 'max_output_tokens'].includes(key))) : request;
      const upstream = await fetchImpl(counting ? `${upstreamURL}/input_tokens` : upstreamURL, { method: 'POST', headers: { ...resolved.headers, authorization: `Bearer ${resolved.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(payload), signal: controller.signal, redirect: 'error' });
      if (!upstream.ok) {
        // Only allowlisted machine codes may cross the local boundary. Provider
        // prose, param names and arbitrary fields can contain credentials.
        let safeCode = 'upstream_http_error';
        try {
          const failure = await upstream.json();
          const code = failure?.error?.code;
          if (SAFE_UPSTREAM_CODES.has(code)) safeCode = code;
        } catch { /* Invalid provider JSON remains a fixed safe error. */ }
        const status = Number.isInteger(upstream.status) && upstream.status >= 400 && upstream.status <= 599 ? upstream.status : 502;
        throw new BridgeError(safeCode, status);
      }
      let result;
      try { result = await upstream.json(); } catch { throw new BridgeError('invalid_upstream_json', 502); }
      if (counting) {
        if (!Number.isInteger(result?.input_tokens) || result.input_tokens < 0) throw new BridgeError('invalid_upstream_response', 502);
        return json(res, 200, { input_tokens: result.input_tokens });
      }
      const message = convertResponse(result, resolved.model);
      usage.requestCount += 1;
      usage.inputTokens += result.usage?.input_tokens ?? 0;
      usage.outputTokens += result.usage?.output_tokens ?? 0;
      usage.cachedInputTokens += result.usage?.input_tokens_details?.cached_tokens ?? 0;
      usage.reasoningOutputTokens += result.usage?.output_tokens_details?.reasoning_tokens ?? 0;
      if (body.stream) sendSSE(res, message); else json(res, 200, message);
    } catch (error) {
      if (!res.destroyed && !res.headersSent) json(res, error instanceof BridgeError ? error.status : 502, { type: 'error', error: { type: errorType(error instanceof BridgeError ? error.status : 502), message: error instanceof BridgeError ? error.code : 'bridge_request_failed' } });
    } finally { clearTimeout(timer); controllers.delete(controller); }
  });
  server.requestTimeout = 300000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  let closing;
  return { getUsage: () => ({ ...usage }), baseURL: `http://127.0.0.1:${server.address().port}`, apiKey,
    close() { return closing ??= new Promise(resolve => { for (const controller of controllers) controller.abort(); server.close(resolve); server.closeAllConnections(); }); } };
}
