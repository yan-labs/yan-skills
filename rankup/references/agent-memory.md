# Agent 记忆精简（memory-tune）

记忆每次会话都进上下文，按“房租”算：只留**换个新会话就推不出来、又一定会用到**的东西。

## 范围
| 层 | 位置 | 说明 |
|---|---|---|
| 项目记忆 | `~/.claude/projects/<路径编码>/memory/` | 每个项目一份，`MEMORY.md` 为索引 |
| 顶层记忆 | 工作区根目录对应的那份 `memory/` | 跨项目的用户偏好、授权 |
| 全局规则 | `~/.claude/CLAUDE.md`（或它链接到的 AGENTS.md） | 只去重、压字，不改含义 |

记忆只在当前机器上，在记忆所在机器执行，不派远程执行机。

盘点：
```bash
for d in ~/.claude/projects/*/memory; do n=$(ls "$d" | wc -l); [ "$n" -gt 0 ] && echo "$(cat "$d"/*.md | wc -c)B ${n}files idx=$(wc -c <"$d/MEMORY.md" 2>/dev/null)B $d"; done | sort -rn
```

## 留还是搬（逐条判）
| 内容 | 去处 |
|---|---|
| 用户偏好、授权、红线（带原话日期） | **留**记忆 |
| 账号、ID、外部资源位置等推不出的事实 | **留**记忆 |
| 做法、步骤、踩坑经验、工具用法 | 对应 Skill 的 SKILL.md / references |
| 某段代码为什么这样写 | 代码注释 |
| 项目事实、架构、流程、状态 | 项目 README、AGENTS.md、`.rankup/`（规则见 [`project-memory.md`](project-memory.md)） |
| 一次性任务细节、已过期状态、已撤销的指令 | **删** |
| 和规则文件、Skill、别的记忆重复 | **删**，留一处 |

拿不准就问自己：删了以后，新会话会做错一件用户在乎的事吗？不会就删。

## 写法
- frontmatter 保留 `name`、`description`、`metadata.type`（系统召回靠它）；正文用最省字的结构。
- 正文首选一行一事实的 `键: 值`，多条同类用紧凑 YAML/JSON；不写 Why/How 套话，原因只在“不写会被误改”时用半句。
- 同主题的碎文件合并成一个主题文件。
- `MEMORY.md` 每行 ≤60 字；整份 ≤3KB。单个记忆文件一般 ≤600 字节。

示例（压缩前 ~700B → 后 ~150B）：
```markdown
---
name: grok-build
description: Grok Build 额度规则
metadata: {type: reference}
---
quota: 每周二约22:13重置; 无充值; 只能 TUI `/usage` 查
exhausted: 402 → 等重置, 编码换下一顺位
```

## 流程
1. 盘点，按体积从大到小处理；先打包快照：`tar czf <报告目录>/memory-snapshot-<日期>.tgz -C ~/.claude/projects <目标目录>`。
2. 逐文件判留/搬/删/合并，列成表（文件、动作、去处）。
3. 先写去处（Skill、注释、README），再删记忆原文；修正 `[[链接]]` 和 `MEMORY.md`。
4. 改 Skill 或项目仓库时守各自仓库规则（公开 Skill 守 SKILL.md「令牌与项目中立」）。
5. 报告：每个目录改前/改后字节、删除与搬迁清单、快照路径。用户偏好、授权类条目删前若存疑，写“未确认”留着，不擅删。
