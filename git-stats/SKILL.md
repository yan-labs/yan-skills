---
name: git-stats
description: 📊 Git 仓库贡献统计。统计每位作者的 commit 数、修改文件数、增删行数，自动合并同一人不同 git 身份（同 email 不同 name、同 name 不同 email 均会通过传递闭包合并）。当用户想要了解团队贡献、查看谁提交了多少代码、分析 git 历史统计、查看代码贡献排行时使用此 skill。触发词包括「git 统计」「贡献统计」「谁提交了多少」「代码量统计」「commit 统计」「每个人写了多少代码」。
---

# 🔍 Git 贡献统计

运行内置脚本快速统计当前仓库每位作者的贡献数据。

## 📋 使用方式

运行脚本（脚本路径相对于此 skill 目录）：

```bash
bash <skill-dir>/scripts/git-stats.sh [range]
```

### 参数说明

`range` 参数控制统计范围，直接传给 `git log`：

| 用法 | 说明 |
|------|------|
| `--all`（默认） | 📊 所有分支的全部历史 |
| 无参数 | 📊 当前分支全部历史 |
| `main..test` | 🔀 test 分支相对于 main 的差异 |
| `--since="2026-01-01"` | 📅 从某个日期开始 |
| `--since="2026-01-01" --until="2026-02-01"` | 📅 指定日期范围 |
| `HEAD~50..HEAD` | 🔢 最近 50 个 commit |

### 示例

```bash
# 全部历史
bash <skill-dir>/scripts/git-stats.sh --all

# 本月统计
bash <skill-dir>/scripts/git-stats.sh '--since="2026-03-01"'

# 某分支 vs 主分支
bash <skill-dir>/scripts/git-stats.sh 'main..feature-branch'
```

## 📊 输出内容

每位作者一行，包含：
- 👤 **作者名** — 同一人不同 git 身份自动合并（传递闭包：同 email 不同 name、同 name 不同 email 均可识别）
- 📊 **占比条** — 可视化 commit 占比
- 📝 **Commits** — 提交次数及百分比
- 📂 **Files** — 修改过的不同文件数（去重）
- ➕ **Added** / ➖ **Removed** / **Net** — 增删行数及净变化
- 📅 **时间范围** — 第一次到最后一次提交的日期

顶部有摘要卡片（总 commits、贡献者数、总增删、文件数），底部有项目总计。

## ⚠️ 注意事项

- 大仓库首次运行可能需要几十秒（需要遍历所有 commit 的 numstat）
- 二进制文件的增删行数不计入统计
- 合并 commit 如果没有实际 diff 则不计入文件和行数统计
- **作者合并**：使用传递闭包算法，如 A 用 email1 提交过 name1 和 name2，会自动合并为一人
- macOS 和 Linux 均兼容
