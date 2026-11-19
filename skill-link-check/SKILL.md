---
name: skill-link-check
description: Use when a skill or slash command is missing, duplicated, not loading, or inconsistent between `.agents/skills` and `.claude/skills`; includes “skill 没生效”“检查 skill 链接” and broken skill links. Audits project and global skill layouts without changing them.
---

# Skill Link Check

## 安装与更新

来源：[Skills.sh](https://skills.sh/example-owner/yan-skills)

```bash
# 首次全局安装，或更新失败时重新安装
npx skills add $SKILLS_SOURCE --skill skill-link-check -g -y

# 更新已安装的全局 Skill
npx skills update skill-link-check -g -y
```

若使用项目级安装，去掉安装命令中的 `-g`；项目级更新使用 `npx skills update skill-link-check -p -y`。

本 Skill 只审计目录布局，不自动移动、删除或覆盖文件：

- `.agents/skills/<name>/` 保存真实源文件。
- `.claude/skills` 要么整体链接到 `.agents/skills`，要么通过逐个子项链接镜像它。

最常见的漂移是 Skill 被直接创建成 `.claude/skills/<name>/` 真实目录，却没有进入 `.agents/skills/`。它看似已安装，实际不会随正常备份、同步或迁移流程保存。

## 完成条件与退出码

在 `/goal` 或持续执行任务里，以审计证据完整为完成条件：从目标项目运行脚本，报告每个适用作用域的布局、问题分类和退出状态。有问题时列数量、路径和建议命令；无问题时报告 clean。脚本不修改被审计目录。

- `0`：审计完成且无问题。
- `1`：审计完成且发现问题；这仍是有效结果。
- Python traceback、参数错误或目标不可读：执行失败，查明后重跑。

## 运行方式

```bash
python3 "$(dirname "$0")/check.py"
```

默认审计：

- **Project**：当前目录下的 `.agents/skills` 与 `.claude/skills`。
- **Global**：`$HOME` 下的同名目录。

自动化或 checker 可使用：

```bash
# 明确指定项目，避免依赖当前工作目录
python3 "$(dirname "$0")/check.py" --project-root /path/to/project

# 只查一个作用域
python3 "$(dirname "$0")/check.py" --project-only
python3 "$(dirname "$0")/check.py" --global-only

# 输出稳定 JSON 证据；发现问题时仍返回 1
python3 "$(dirname "$0")/check.py" --json
```

## 两种合法布局

两种模式都应通过：

1. **Parent symlink**：`.claude/skills` 本身指向 `.agents/skills`。新增 Skill 自动保持一致。
2. **Per-child symlinks**：`.claude/skills` 是真实目录，每个 `.claude/skills/<name>` 指向 `../../.agents/skills/<name>`。

脚本会自动识别模式，不要求为了统一风格而改造一个本来健康的布局。

## 问题分类

- `orphan-in-claude`：`.claude/skills/` 中有真实条目，但 `.agents/skills/` 没有对应源文件。报告时优先列出。
- `missing-link`：源 Skill 存在，但运行时镜像缺失。
- `not-symlink`：逐子项模式下，镜像位置是重复的真实文件或目录。
- `broken-symlink`：链接目标不存在，包括损坏的父级链接。
- `wrong-target`：链接存在，但指向错误 Skill 或 `.agents/skills` 之外。

## 报告规则

1. 先给总问题数和分类计数；有 `orphan-in-claude` 时先报告它。
2. 每项给出名称、证据路径和一行解释。
3. 原样附上脚本生成的建议修复命令，便于用户复核后执行。
4. 不自动修复。孤儿目录可能是用户尚未迁移的工作，重复目录也可能已经分叉；自动移动或删除会造成数据损失。
5. 如果全部健康，一句话说明适用作用域及布局模式即可结束。

## 验证 Skill 自身

```bash
python3 -m unittest discover -s "$(dirname "$0")/tests" -v
```
