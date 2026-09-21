// 本地假上游:一个最小化的 Anthropic Messages 协议服务端,只用于 smoke-test.mjs 里的
// 端到端验证。不代表任何真实模型的行为——它对收到的请求内容完全不理解,只负责按
// Anthropic 的流式协议格式吐出一段固定文本、以 end_turn 收尾,让真正的 Claude Code CLI
// 子进程能够跑完一整个 query() 循环并产出 result 消息。
//
// 目的:验证 agent-fleet 整条链路(读配置 -> 起 SDK client -> bypassPermissions ->
// 发请求 -> 收流式响应 -> 落地成 result 消息)在代码层面是打通的,不需要任何真实的
// 第三方 API key。
//
// 每个收到的请求都会被记录进 receivedRequests,方便 smoke-test.mjs 断言「CLI 确实把
// 请求发到了这个 baseURL,而不是官方 Anthropic 端点」。

import { createServer } from 'node:http';

const FIXED_REPLY_TEXT = 'MOCK_UPSTREAM_OK: agent-fleet smoke test received this reply from the local fake Anthropic-compatible server.';

/**
 * 启动 mock 服务器。
 * @returns {Promise<{ port: number, baseURL: string, receivedRequests: object[], close: () => Promise<void> }>}
 */
export function startMockAnthropicServer() {
  const receivedRequests = [];

  const server = createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        // 请求体不是 JSON 也照常记录原始字符串,方便排查。
      }
      receivedRequests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: parsed ?? body,
      });

      if (req.url?.startsWith('/v1/messages/count_tokens')) {
        // token 计数是非流式的一次性 JSON 响应,给个够用的假数字就行。
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ input_tokens: 100 }));
        return;
      }

      if (req.url?.startsWith('/v1/messages')) {
        respondWithFakeCompletion(res, parsed);
        return;
      }

      // 未预料到的路径:不让连接挂死,回一个空 JSON 并记录下来,交给 smoke-test 的
      // 断言去发现「协议假设是不是漏了什么」。
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{}');
    });
  });

  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolvePromise({
        port,
        baseURL: `http://127.0.0.1:${port}`,
        receivedRequests,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

/**
 * 按 Anthropic Messages 的流式 SSE 协议吐出一段固定文本,stop_reason 为 end_turn。
 * 事件顺序:message_start -> content_block_start -> content_block_delta(可以多条)
 * -> content_block_stop -> message_delta(带 stop_reason/usage) -> message_stop。
 * 真正的模型响应会有更多细节(工具调用、多个 content block 等),但「不用工具、直接
 * 用文本结束回合」是 Claude Code CLI 必须能正确处理的最基本路径,足够验证链路打通。
 */
function respondWithFakeCompletion(res, requestBody) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const modelEcho = requestBody?.model ?? 'mock-model';
  const messageId = `msg_mock_${Date.now()}`;

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  send('message_start', {
    type: 'message_start',
    message: {
      id: messageId,
      type: 'message',
      role: 'assistant',
      content: [],
      model: modelEcho,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 50, output_tokens: 0 },
    },
  });

  send('content_block_start', {
    type: 'content_block_start',
    index: 0,
    content_block: { type: 'text', text: '' },
  });

  send('content_block_delta', {
    type: 'content_block_delta',
    index: 0,
    delta: { type: 'text_delta', text: FIXED_REPLY_TEXT },
  });

  send('content_block_stop', { type: 'content_block_stop', index: 0 });

  send('message_delta', {
    type: 'message_delta',
    delta: { stop_reason: 'end_turn', stop_sequence: null },
    usage: { output_tokens: 20 },
  });

  send('message_stop', { type: 'message_stop' });

  res.end();
}

export { FIXED_REPLY_TEXT };
