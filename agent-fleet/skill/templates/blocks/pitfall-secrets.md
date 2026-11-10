秘密仅经受控存储与进程通道使用。查配置用 `safe-grep '模式' 路径`，输出限名字、计数或存在状态；配置、环境变量、ConfigMap、.env 或 config 源码的其它必要读取用 `命令 2>&1 | redact`，让 stdout 和 stderr 从源头进入脱敏器。检索保持零上下文（-A/-B/-C 属上下文选项），输出范围保持在上述摘要内。读到未遮挡凭据时结束该次读取，在报告「偏差」仅记录位置和类别。
工具路径通过 `export PATH="$AGENT_FLEET_DIR/bin:$PATH"` 加入；用法与漏检限制见 agent-fleet 的 `docs/redact.md`。脱敏为模式识别，仅降低泄露概率，新格式仍需按上述摘要方式读取。
