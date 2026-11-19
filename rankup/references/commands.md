# 命令细则、安装与版本、跨项目登记表

`SKILL.md` 只留每个命令的一两句摘要；本文件是 `rankup init`、`rankup review`、安装更新与跨项目资产登记表的全文。
`rankup check` 的编排在 [`playbooks/site-review.md`](playbooks/site-review.md) 第二节，`rankup doctor` 的编排在 [`maintenance.md`「六」](maintenance.md#六rankup-doctor整理-rankup-的显式入口)，清理用法在 [SKILL.md「清理」](../SKILL.md#清理)，这里不重复。

## 目录

- `rankup init`：给全新或没有 `.rankup/` 的老项目建档
- `rankup review`：全站体检的分组与会话信号挖掘
- 三个命令的分工
- 安装与版本：安装、更新、版本检查的行为
- 跨项目资产登记表：`registry.mjs` 与 `registry.md`

## `rankup init`

用于全新项目，或做了很久还没有 `.rankup/` 的项目。后者是常态，不得因为缺记忆就重建技术栈。

1. 摸清现状：`package.json`、路由、部署配置、`git log`；已上线的再取线上 `sitemap.xml`、`robots.txt`、首页。外部系统一律实时查询。
2. 按 [`project-memory.md`](project-memory.md) 建 `.rankup/` 全套，取不到的写 `待确认`。
3. `integrations.md` 用完整平台表初始化全部 ⬜（[`discipline.md`](discipline.md) 十）。
4. 已运行项目补 `baseline.md` 与 `audit.md`；`roadmap.md` 写阶段目标与放弃条件。
5. 绿地项目脚手架跑通即建**私有**远端仓。
6. 建 git 仓库或初始化 `.rankup/` 时装好 pre-commit hook 与 `.rankup/.gitignore`：

```bash
node "<rankup-skill-dir>/scripts/maintain/rankup-clean.mjs" --project-root . --install-hook --write-gitignore
```

已有 `.rankup/` 时不覆盖，转为补齐并提示用 `review` 或 `doctor`。

## `rankup review`

对站本身做全面体检，编排在 [`playbooks/site-review.md`](playbooks/site-review.md) 第一节。

- 每轮核 [Cloudflare 循环消耗红线](cloudflare-stack.md#89-循环消耗与账单熔断红线)，含后台 alarm、通知、重试及真实熔断。
- 先摸前提，再把可独立运行的组按可用并发派出：技术 SEO / 速度 / GEO / 关键词长尾 SERP / 哥飞官方 Skill 数据复核 / 市场规模 / 接入与记忆；主 Agent 汇总回写。
- A 组含 AITDK 全站报告，Issues 与未满分项一律必修（[`checklists.md`](checklists.md)「闸门 4c」）。
- G 组：`scripts/review.mjs --project-root .` 出五块报告；会话记录用 `scripts/sessions.mjs --project-root . --days 14 --new-only`（水位线在 `.rankup/review-state.json`，`--dump` 消化完才 `--mark`），从中找用户纠正、验证过的结论、坑与根因、已推翻旧记录的事实，并**修订**原条目。
- review 发现 Day-1 项缺失，先回流进段 3 / 段 4 清单再修站。

## 三个命令的分工

| 命令 | 回答什么 | 动什么 |
|---|---|---|
| `rankup check` | 现在在哪一段、下一步做什么 | 只读定位，零配额，不派多组 agent |
| `rankup review` | 这个站本身有什么问题 | 全站体检，修站 |
| `rankup doctor` | 项目记录还可不可信、好不好接手 | 只整理 `.rankup/` 与根层登记，不碰站点代码与线上 |

check 命中下列任一条就明说「这已经不是 check，是 review」并转全站体检：已上线但 `audit.md` 缺失、`.rankup/` 不存在、动过线上 URL 且超过一轮没体检、用户问的其实是站有什么问题。边界细则见 [`discipline.md`](discipline.md) 十三。

## 安装与版本

先装 `opencli`（`npx skills add $SKILLS_SOURCE --skill opencli -g -y`）。OpenCLI 本体装我们自己的构建，不是应用商店版：商店版默认前台抢标签页，失败不报错。`opencli doctor` 报扩展版本过低时照它说的做。浏览器通道及会话规则见 [`discipline.md`](discipline.md) 五。

Web 项目的 Cloudflare 工具链：`npm i -g cf`、`npx skills add $SKILLS_SOURCE --skill cf-cli -g -y`；现有项目继续用项目锁定的 Wrangler。

```bash
npx skills add $SKILLS_SOURCE --skill rankup -g -y   # 全局安装
npx skills update rankup -g -y                            # 全局更新
npx skills update rankup -p -y                            # 项目级更新
```

- 发布版本记录在 `skill.json`；项目的启用时间、已安装版本和最近检查状态记录在 `.rankup/skill-state.json`。
- `check-version.mjs` 最多每 24 小时访问一次远端，只更新本 Skill；网络失败保留当前版本，不得伪称已更新。
- 源码检出（仓库根有 `.skill-source`）或工作区有未提交修改时拒绝更新并报告原因。
- 链接被换成实体目录时，在仓库里跑 `node scripts/link-skills.mjs` 恢复（这是仓库根的脚本，不在本 Skill 的 `scripts/` 下）。
- 版本号规则见 [`maintenance.md`「五」第 6 条](maintenance.md#五维护-skill-源码rankup-本身)。

## 跨项目资产登记表

各项目的 `.rankup/` 互不可见，登记表把可复用脚本索引到一处，只索引不复制。

```bash
node "<rankup-skill-dir>/scripts/registry.mjs" scan --roots <存放项目的目录>   # 整表重建
node "<rankup-skill-dir>/scripts/registry.mjs" list                          # 查看
```

- 产物是 Skill 目录下的 `registry.md`，含项目名与绝对路径，因此被 `.gitignore` 排除，并由 `scripts/validate-rankup.mjs` **断言绝不能被 git 追踪**。
- 扫描根目录来自 `--roots`、`RANKUP_PROJECT_ROOTS` 或 `~/.rankup/config.json`，绝不写死。
- 它与 [`registry.md`（可复用接入分支登记）](registry.md)不是一回事：后者是随 Skill 分发的接入分支索引。
