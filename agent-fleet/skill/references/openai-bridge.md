# OpenAI轻量适配层

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

验证：test/openai-bridge-test.mjs覆盖真实SDK工具mock循环、协议/错误/清理；真实官方调用已验证Bash、Read与原SDK会话resume。基础API入口及权益限制见SKILL.md。

当前边界：先等待OpenAI完整响应再转SDK SSE，无实时首token；延迟工具注册、tool_reference、原生web_search与未支持内容明确拒绝；未验证的Claude特殊功能不承诺等价。暂不为这些未使用能力增加代码。赠送额度到账和抵扣以平台账单为准。
