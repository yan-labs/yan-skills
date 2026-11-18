# OpenAI API 入口与适配层

## 入口与额度

`fleet-go new <名> --to openai --auth local --goal "任务" --body task.md`，或底层 `fleet openai task.md`。默认官方 `terra`，不用 Sol、不开 fast，偏慢，适合不急的正经编程。`--to gpt` / `fleet code` 仍走 Codex，Codex 用满后自动改派见 [额度换手](fallback-chains.md)。

- 凭据变量 `OPENAI_CREDIT_API_KEY` 只放 agent-fleet 目录的 `.env`（0600），不写进 brief、命令或报告。
- 先在 ChatGPT/API Billing 激活并关联正确的 API 组织，Key 必须属于该组织；普通 API 调用成功不等于赠送额度已到账。
- 赠送额度先用，耗尽后若有已购余额仍可能继续扣费，不能承诺“只用赠送额度”。到账、到期和实扣以平台的 Credit grants 和 Usage 为准；不自动充值、不改套餐。[官方说明](https://help.openai.com/zh-hans-cn/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions)。
- 这个入口复用 Claude Agent SDK 的本地工具、会话、收件箱、resume 与报告；不经 Kollab 网关，也不用 Codex 的 API Key 通道。

## 适配层实现

决策：复用现有Claude Agent SDK，不引入LiteLLM/CCR服务、Python/Rust运行时或额外npm依赖。

实现为 src/openai-bridge.mjs（约200行），只做三项转换：
- Anthropic消息/系统指令 → Responses input/instructions。
- tool_use/tool_result/schema → function_call/function_call_output/function tools，保留call_id及顺序。
- Responses文本、工具、stop原因与实际token用量 → SDK所需JSON/SSE。

HTTP仅每run临时127.0.0.1随机端口和随机本地token；真实官方Key只在父进程桥内，现有SDK工具/租约/收件箱/会话逻辑不迁移。run结束释放服务。只添加openai入口，不替换Claude/Kollab/Codex路由。

源码核对参考：c2js/claudecode-openai-proxy-rs 的 src/transform.rs，MIT授权：
https://github.com/c2js/claudecode-openai-proxy-rs/blob/main/src/transform.rs
https://github.com/c2js/claudecode-openai-proxy-rs/blob/main/LICENSE

这里按协议独立实现，未复制第三方代码。没有照搬其GPT-5前缀限制、Azure配置、Web后台、模型映射或自动降级，也没有照搬未知输出静默忽略或工具参数坏JSON兜底空对象的行为。top_k等未支持选项明确失败，不静默改变请求。未来如实际复制其代码，须同时保留对应MIT版权和许可。

验证：test/openai-bridge-test.mjs覆盖真实SDK工具mock循环、协议/错误/清理；真实官方调用已验证Bash、Read与原SDK会话resume。

当前边界：先等待OpenAI完整响应再转SDK SSE，无实时首token；延迟工具注册、tool_reference、原生web_search与未支持内容明确拒绝；未验证的Claude特殊功能不承诺等价。暂不为这些未使用能力增加代码。赠送额度到账和抵扣以平台账单为准。
