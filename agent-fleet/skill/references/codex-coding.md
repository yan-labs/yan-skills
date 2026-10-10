# Codex 编程与 review

## 执行

```bash
fleet-go new task --to gpt --auth local --goal "完成编码任务" --body brief.md
# 以下为底层短命令
fleet code brief.md --cwd <项目目录>
fleet code brief.md --low --cwd <项目目录>
fleet code brief.md --review --cwd <项目目录>
```

默认本机 `gpt-6.1-sol`、medium、`danger-full-access`（全权限、可联网）；`--low` 改为 low，`--review` 改为只读并在 brief 前加入下方审查模板。`brief.md` 可换成直接输入的任务文本。结果和日志写入 `~/.agent-fleet/runs/`，结束后核对 diff、产物及相关测试；退出码 0 不等于验收通过。

失败只如实上报执行者/档位、脱敏原始错误、已完成步骤、产物与 dirty 状态；fleet 不判断原因或更换执行者。派用者顺位参考：Claude `claude → code → kollab-gateway-gpt-sol → grok → gemini`（仅文本）；GPT `code → kollab-gateway-gpt-sol → grok`，GPT 档含网关 gpt-sol。派用者按事实自行判断，用 `fleet-go relaunch <name> --to <产品>` 重派；网关 GPT 用底层 `fleet gpt`。不要打印登录文件或密钥。

## 中途插话

```bash
fleet say <任务短名或 run-id> "只写到 3 并停止"
fleet-go amend <name> "补充要求" --say
fleet resume <异常中断的任务> "继续完成剩余工作"
```

`FLEET_CODEX_BACKEND` 可取 `app-server`（默认优先模式，失败时仍可降级）或 `exec`（直接使用原执行器）；例如 `FLEET_CODEX_BACKEND=exec fleet code brief.md`。只读 review 和 resume 沿用 exec。

运行中的 app-server 任务仍会显示在 Codex APP；任务终态及异常退出清理时仅归档该任务的 threadId，保留历史。归档失败只记降级，不改变 verdict。Codex 0.162.0 的归档线程不能直接 resume；fleet 会先取消归档、续跑结束后再归档。

每个 `fleet code` 任务优先启动独立 `codex app-server`，仅用 stdio，不共享服务或开放端口。`say` 在同一 thread/当前 turn 上调用 `turn/steer`；初始化期间先排队。简报保存 threadId、执行模式、steer/resume 次数与降级记录。`resume` 根据 threadId/sessionId 开新 run，沿用 cwd、low/review、name/report。

app-server 启动或握手失败时退回原 `codex exec`；已有会话的 steer 被拒时，先 SIGINT 并等待当前执行结束，再 `codex exec resume` 同一会话（新一轮）。没有可续跑会话或续跑不可用时，明确提示改用 `fleet-go amend --restart`。exec 兜底始终保留；只读 `--review` 如不能等价使用 app-server，则退回原 read-only exec，不放宽沙箱。

steer 被接受不等于立即执行，插话无法撤销已经完成的文件写入；结束后仍要核验产物。没有 threadId/sessionId 的旧记录不能 resume。server 异常退出且无法确认旧工具已结束时，会保守拒绝续跑并提示 `--restart`；执行器仍活着时也不启动重复会话。

## 哪些任务需要额外 review

编码类按全局 CLAUDE.md §4.3 由另一个只读 GPT-6.1 Sol 对照最终 diff 和检查记录做 review；跨模块重构、数据迁移、权限、计费、删除、外部写入及结果不明确的任务尤其不能省。文案、简单配置、有明确测试的单点修复可免；用户或项目要求 review 时仍执行。审查发现实际问题后修复并重跑受影响检查。执行者只跑 brief 要求的已有测试，不新写测试或安全防护代码（见 SKILL.md「产品与任务边界」）。

## 可直接使用的 review 提示词

```text
你是独立 reviewer，只读，不修改文件、不转派、不扩大任务。
目标：判断本次任务的最终产物是否满足需求，有没有需要修复的实际问题。
允许读取：<精确文件/最终 diff/测试记录>。
上下文与边界：<真实用户、部署方式、数据来源、已存在的权限防护>。

只报告高置信且可达的问题：具体输入或正常操作/合理的滥用路径，如何经过现有代码触发，造成什么实际影响，文件与行号或产物证据，最小修复办法。
优先正确性、数据完整性、真实权限边界和用户流程。安全问题必须说明信任边界与触发条件；不要假定攻击者已取得管理员权限、控制运行环境或突破现有防护后，再把后续问题当成新漏洞。
不要编造“90%/99%不会发生”之类概率。低频但可达且会导致重大泄露、越权或数据丢失的问题仍要报告。
没有证据的猜测、纯防御加固、风格偏好、未来扩展、必须连锁假设才成立的风险，不作为阻断问题；不建议额外架构或安全系统。
最多三条关键问题，每条最多三行：严重程度；位置+触发条件+影响；最小修复。超过三条时仍明确剩余真实问题数量和是否需要后续查看，不能用数量上限隐藏阻断问题。
没有实际问题就只回复“通过：未发现需要修复的实际问题。”，不凑建议。
```

## 本机验证记录

2026-09-27，本机 Codex CLI 0.157.1：`gpt-6-sol` 的 medium/low 编码及 medium 只读审查曾通过独立样例验证。历史结果只说明当时账号可用；当前以实际运行和测试为准。

2026-09-30，本机默认模型改为 `gpt-6.1-sol`。Codex CLI 0.158.0 调用它会被服务端以「not supported when using Codex with a ChatGPT account」拒绝；0.159.0 的 low 只读样例通过。所以本机 Codex 必须 ≥ 0.159.0（Homebrew 安装的用 `brew upgrade --cask codex` 升级，升级前先确认没有别的 Codex 任务在跑）。旧版本调用会失败；fleet 只上报事实，由派用者判断后续执行者。

补扫漏归档线程：`node ~/Project/kcsx/macmini/yan-skills/agent-fleet/bin/fleet-archive-sweep.mjs [--dry-run] [--json] [--min-idle-minutes 10]`。派单前及 Codex 完成后运行；派单入口也会后台补扫（不等待、失败不阻断），`FLEET_NO_ARCHIVE_SWEEP=1` 可关闭自动扫描。
