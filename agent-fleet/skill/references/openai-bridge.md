# OpenAI API 入口与适配层

## 入口与额度

`fleet-go new <名> --to openai --auth local --goal "任务" --body task.md`，或底层 `fleet openai task.md`。默认官方 `terra`，不用 Sol、不开 fast，偏慢，适合不急的正经编程。`--to gpt` / `fleet code` 仍走 Codex，Codex 用满后自动改派见 [额度换手](fallback-chains.md)。

- 凭据变量 `OPENAI_CREDIT_API_KEY` 只放 agent-fleet 目录的 `.env`（0600），不写进 brief、命令或报告。
- 先在 ChatGPT/API Billing 激活并关联正确的 API 组织，Key 必须属于该组织；普通 API 调用成功不等于赠送额度已到账。
- 赠送额度先用，耗尽后若有已购余额仍可能继续扣费，不能承诺“只用赠送额度”。到账、到期和实扣以平台的 Credit grants 和 Usage 为准；不自动充值、不改套餐。[官方说明](https://help.openai.com/zh-hans-cn/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions)。
- 这个入口复用 Claude Agent SDK 的本地工具、会话、收件箱、resume 与报告；由 OpenAI 官方 Responses API 提供模型调用。

## 适配层

`src/openai-bridge.mjs` 把 Anthropic 消息、工具和调用 ID 映射到 Responses API，再将响应、停止原因与用量转为 SDK 需要的 JSON 或 SSE。每次运行使用独立 loopback 随机端口与本地 token，官方 key 由父进程持有。

当前先取完整上游响应再转 SSE。未支持的工具及参数会明确报错。排查协议映射、工具循环和清理时运行 `node test/openai-bridge-test.mjs`。
