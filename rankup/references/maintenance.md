# 维护：在使用中顺手维护 Skill 与项目 `.rankup/`

**系统必然熵增。** 文档越用越多、结论会被推翻、脚本会改名、任务做完会留下流水；没人维护，下一个会话读到的就是过期结论。
所以维护**不靠隔一段时间开专门任务**，而是每次正常使用时顺手做：读到就清、改了就扫、收尾必走。
本章是维护动作的唯一源；入口 `SKILL.md`「收尾」、[`playbooks/resume.md`](playbooks/resume.md)、[`project-memory.md`](project-memory.md) 的接力协议与目录规范都指向这里。
使用者的全局 Agent 规则若另有「实时更新与清理」条款，两者一致；有出入时以更严的一条为准。

**定位**：`.rankup/` 是承上启下的工具，只管**长远规划**与**当前进展**，不是日志容器。
事实原地修订（[`project-memory.md` 核心原则](project-memory.md#核心原则这是一部-wiki不是一本日志)），过程与流水不进来。

## 目录

- 一、什么时候必须走本章
- 二、收尾维护：五步，顺序固定
- 三、可检查判据（清理）
- 四、决策与结论类文档怎么维护
- 五、维护 Skill 源码（rankup 本身）
- 六、`/rankup doctor`：整理 `.rankup/` 的显式入口
- 七、三层归属与项目记忆维护规范

## 一、什么时候必须走本章

任务收尾时，下面**任何一种**成立就维护；先按本节轻量路径分流，有沉淀再走「二、收尾维护」，不需要用户督促：

| # | 触发 | 例子 |
|---|---|---|
| 1 | 写了或改了脚本 | 新增 `scripts/*.mjs`、改参数、修 bug、改输出字段 |
| 2 | 把手工操作变成脚本，或本该变成脚本却还是手工做的 | 触发条件与验收见「五」第 1 条 |
| 3 | 产生新结论、经验、决策、判据（含否决与阈值） | 选词裁决、某平台口径变了、某条红线被证伪 |
| 4 | 改了线上状态 | 部署、DNS、接入、索引开关、支付配置 |
| 5 | 任务完成、放弃、被叫停、等用户决定 | 任何一种结束方式 |
| 6 | 发现旧内容过期、冲突、重复或断链 | 读 `.rankup/` 或 references 时撞见 |

**轻量路径**：纯只读问答免先写接力；小修小改或无可沉淀，不必走完整五步，收尾在回复末尾写一句「维护：无可沉淀（理由）」即合格，不硬凑经验。已有状态变化的仍按接力协议保留最小进度。没有 `.rankup/` 的项目，用项目根 `HANDOFF.md`（或已有进度文件）记录同样的接力与收尾清理，不因此强制 init。
**开工与过程中的写入**（开工先写接力、每个里程碑覆盖、派出或收回后台任务立刻记）按 [`project-memory.md` 接力协议](project-memory.md#接力协议任务随时可能中断新会话必须立即接上)执行，不等收尾。

## 二、收尾维护：五步，顺序固定

| 步 | 做什么 | 完成标志 |
|---|---|---|
| ① 全量扫描 | 列出本轮动过的术语、脚本名、路径、阈值、结论关键词，跑 `node <rankup>/scripts/maintain/ref-scan.mjs <词或路径…> --rankup <项目>/.rankup`（工作区有根层记录再加 `--rankup <工作区根>/.rankup`；改 Skill 源码时不加也会扫 Skill 全目录与仓库 README），逐处判定改、删或保留；改完**再跑一次**，确认旧说法无残留。不凭回忆找引用 | 第二次扫描只剩有意保留的命中，并能说出每处为什么留 |
| ② 结论原地修订 | 按下文「四」更新决策类文档：推翻的原地改写（删旧写新，不注释旧文、不写“旧的作废”，Agent 记忆同理，见 [`agent-memory.md`](agent-memory.md)），否决写理由与复活条件，重复的收成一处；本轮新经验按「七」判归属（项目层 / 全局层 / 源码层） | 同一结论只有一处全文，其余是指针 |
| ③ 清理任务型内容与过程数据 | 按下文「三」的判据清（证据与备份按 Skill 待确认流程处理）：已完成任务只留一行结论加报告路径，已收回的后台任务、过期接力删掉；跑 `node <rankup>/scripts/maintain/rankup-clean.mjs --project-root <项目> --apply` 将截图/图片、日志、trace/har、测试输出、压缩包与超阈值或未引用原始数据直接删除（不回收、不备份），同时把 `.rankup/` 内 md 指向被清文件的相对链接改为行内文字「（原始数据已清理 <日期>）」 | `rankup-clean.mjs` 待清为 0，`doc-lint.mjs` 断链为 0，`rankup-doctor.mjs` 无「接力超长」「任务型残留」「过程数据残留」告警 |
| ④ 脚本沉淀 | 满足「五」第 1 条的操作存成参数化脚本并用真实参数跑一次（细则见下文「五·1」） | 报告有「## 沉淀的脚本」一节（没有写「无，理由：…」） |
| ⑤ 最后写接力 | 覆盖 `INDEX.md`「接力」为当前状态；同步 `plan.md` 与根层 `portfolio.md`、`projects.json`（按「四」的校验规则）；回复里用一行说明清了什么 | `grep -n "下一条要执行的动作" .rankup/INDEX.md` 有结果 |

## 三、可检查判据（清理）

【经验·起步阈值】，脚本能查的都已在 `scripts/maintain/` 里：

| 检查 | 判据 | 怎么查 |
|---|---|---|
| INDEX 接力长度 | 「接力」一节 ≤ 20 行 / 2 KB；`INDEX.md` 全文 ≤ 60 行 / 6 KB；单行 ≤ 400 字 | `rankup-doctor.mjs` |
| 任务型残留 | 接力与 `plan.md` 里已完成（✅、已完成、done）的条目只留一行结论加报告路径；逐步过程、一次性 brief、命令输出不在常驻文件里 | `rankup-doctor.mjs` 标出，人判 |
| 常驻文件大小 | 按[目录规范](project-memory.md#目录规范常驻文件保留什么去哪里多大)逐文件的上限（例如 `decisions.md` 150 行 / 16 KB，其余文件与 `journal/` 以目录规范表为准） | `rankup-doctor.mjs` |
| 断链 | `.rankup/` 与 Skill references 里相对链接、锚点断链为 0 | `doc-lint.mjs --root <项目>/.rankup`；Skill 用 `doc-lint.mjs` |
| 过期日期 | 时效契约覆盖的文件（`INDEX.md`、`plan.md`、`keywords.md`、`baseline.md`、`integrations.md`、`infrastructure.md`）最新日期超过 30 天：重新核实，或标「待核实」 | `rankup-doctor.mjs --stale-days 30` |
| 过程数据残留 | `.rankup/` 内截图和图片、日志、trace/har、测试输出（如 surefire xml）、压缩包、超阈值或未被常驻文件（`INDEX.md`、`plan.md`、`decisions.md`、`leftovers.md` 等）直接引用的原始 `json`/`jsonl` 等可默认清理的过程数据为 0（证据与备份待确认除外）；默认时限7d；Git已跟踪文件不删并列待确认；常驻文档与非过程目录的脚本和代码保留（`mjs`/`js`/`cjs`/`ts`/`py`/`sh`/`sql`）、配置和状态文件（`skill-state.json`、`review-state.json`、`projects.json`、断点状态等）、`.rankup/.keep-data` 白名单及常驻文件直接引用的小体积结构化数据 | `rankup-clean.mjs --project-root <项目>`（默认只列计划，`--apply` 直接删除并改写 md 链接；`--staged` 供pre-commit限定候选，已跟踪/已暂存文件仍保留）；`rankup-doctor.mjs` 归入 A 类 |
| 备份与临时文件 | 证据与备份的待确认核查、用户确认及显式删除参数统一见下文[清理用法](#清理用法) | `rankup-doctor.mjs` |
| 目录外文件 | 顶层文件（含合法根层与已登记项目专属文件）都在[目录规范](project-memory.md#目录规范常驻文件保留什么去哪里多大)里；带日期的一次性文件归入 `research/` 或 `journal/` | `rankup-doctor.mjs` |
| Skill 文档体积 | references 单文件 > 600 行或 > 80 KB 就拆，主文件留入口与判据 | `doc-lint.mjs`；拆用 `split-doc.mjs` |

**必须保留（精华）**：长远目标与定位、当前进展与下一条动作、仍有效决策及原因、否决方向及复活条件、可复用脚本与入口登记。

判不准是不是精华时，问一句「新会话少了这句会不会走错路」，不会就删；删的是**能从报告路径或 git 历史找回**的内容。

### 清理用法

本节是清理项目 `.rankup/` 过程数据的唯一源（fleet 的日志与报告归 agent-fleet）。用户说「清理一下」默认 7 天，普通清理直接执行不先问。

```bash
node "<rankup-skill-dir>/scripts/maintain/rankup-clean.mjs" --workspace <工作区> --older-than 7d --apply   # 单项目用 --project-root <项目>；一周可写 1w
```

- 不加 `--apply` 只预览（`--dry-run` 始终只预览）；`--apply` 直接删除，不进回收站、不备份。
- 删什么：按修改时间删过程数据，以及 `research/`、`journal/`、`reports/`、`evidence/` 里的旧报告和临时脚本；历史 trash 按同一时限清。指向被删文件的链接改成行内文字。
- 不删什么：Git 已跟踪的文件（列入待确认）、常驻文件、`.keep-data` 白名单、状态文件。Git 索引无法核实时整个项目不删并写明原因。
- 证据和备份（路径含 backup/evidence/snapshot/dump，或 SQL、bak、数据库副本等）只列「待确认」，按目录或项目聚合成约 50 行以内的清单（路径前缀、文件数、总大小、最新时间、是否被引用）；`--json` 保留每项明细。未发现引用不等于无用。
- 待确认项由主线程逐项核实后问用户，同意的才加 `--include-backups <路径…>` 删除，仍受时限与常驻、状态、运行中保护约束。

## 四、决策与结论类文档怎么维护

适用 `keywords.md`、`rejected.md`、`decisions.md`、`research/`、`plan.md`、`checks.md`、`journal/`、`INDEX.md`，以及工作区根层的 `portfolio.md`、`projects.json`。

1. **新证据推翻旧结论 → 原地修订**：到结论最初写下的地方改写，把考证过程与日期留在记录，并在修订处按需指向证据；不在别处并列一条新说法。`decisions.md` 用 `superseded` 状态保留旧决定、链接新条目。
2. **否决（`rejected.md`）**：每行必须有一句理由和可判定的复活条件。复活条件满足时，把该行**移出表格**，在 `decisions.md` 写新条目（引用原否决理由与已满足的条件），并在 `rejected.md` 末尾「已复活」一节留一行指针（对象、日期、DEC 编号）。超上限时先归档已复活或已过期的条目，保留否决理由、复活条件与证据指针，不硬删；仍超标就标注待用户决定。旧口径「原行保留、状态改 revived」停用，已有的 revived 行在下一次 doctor 时按新口径迁移。
3. **已完成的任务型内容**：只留一行「结论 + 报告路径」（报告在仓库外或 `research/` 里）。
4. **同一结论多处出现**：以一处为准，其余改成指针。优先级：`decisions.md` > `keywords.md` / `rejected.md` > `topics/` > `INDEX.md` 摘要。
5. **过期数据**：带观察日期（时效契约）；过了可信区间的重新核实，或明确标「待核实」，或删除。
6. **`research/` 报告**：原文只增不改，它是证据；结论被推翻时只在报告顶部加一行「已被 <日期> <文件或 DEC> 推翻」。
7. **`journal/`**：已记录的判断原文不改写（被推翻时从推翻它的地方反向链接）；但逐步操作、命令输出、一次性 brief 这类流水按「三」压缩成结论加依据，不无限堆积。归档按原观察日期命名 `journal/YYYY-MM-DD-archive-<主题>.md`，超标拆成同日多篇，不改日期凑上限。
8. **根层 `portfolio.md` / `projects.json`**：阶段、线上状态、下一步与项目内 `INDEX.md` 一致。回写 `projects.json` 前把原文件复制到 `.rankup/` 之外（或确认已在 git 里），用 `jq '… |= …'` 就地更新，改后比对条目数：`jq '.projects | length'`（按实际结构取数组或对象键数）前后必须相等，不等立即恢复。用 `select` 过滤登记表可能静默丢掉其他条目。备份统一按「三」的 C 类口径处理；没有根层登记时此项标 N/A，不创建登记表。doctor 只报当前条目数，执行者须把整理前后计数写进报告。

按时间清理多个项目：`node <rankup>/scripts/maintain/rankup-clean.mjs --workspace <工作区> --older-than 7d --apply`；不指定 `--older-than` 默认7d，历史trash同样按mtime；不指定 `--apply` 只预览。时间筛选额外覆盖 research/journal/reports/evidence 的报告和临时脚本；常驻文件、白名单、state 保留；证据与备份走「三」[清理用法](#清理用法)的待确认流程，历史 trash 也遵守同一规则。

## 五、维护 Skill 源码（rankup 本身）

1. **可复用操作落成脚本**：在授权修改范围内，把确定会重复的链路本轮参数化并跑通，省掉下轮重写；只读或禁止改脚本的任务仅列候选。具体判定：会再做一次、换个站或词或日期就要重跑、驱动登录态浏览器超过约 5 步、同一串命令本轮手敲 2 次以上，满足任一条就在本轮存成脚本。动手前先查本 Skill `scripts/`、backlink `scripts/`、opencli adapter 与跨项目登记表（`registry.mjs list`），有就用，不好用就修；没有就把第一次跑通的链路当场写成参数化脚本：通用的放本 Skill `scripts/<动词-对象>.mjs`，头部注释写用途、参数、登录态依赖、已知坑、验证日期；只属于某个项目的放 `<project>/.rankup/scripts/` 并登记进 `INDEX.md`。写完用真实参数跑一次，没跑通不算沉淀。登录态、property ID、账号配置只作参数或项目侧配置。
2. **经验回流**（「把这个经验写进 rankup」）：先按 [`experiences/INDEX.md`](experiences/INDEX.md) 定证据等级与归属层，再按 [`evolution.md`](evolution.md) 晋升门判进 Skill 还是留项目；进 Skill 的写进**对应的现有文件**，不带站名与数字；同一条已有就原地更新旧条目的适用条件、内容与依据，不另起一条；改完跑 `node scripts/validate-rankup.mjs`，直接提 main（多会话共用工作树时只提 rankup 相关文件，不用 stash / reset）。面板与网页操作口径的修正先过 [`discipline.md`](discipline.md) 十五的五层分诊。
3. **改术语、路径、阈值、脚本名**：先 `ref-scan.mjs` 全量扫描（Skill 全目录、仓库 README、`skill.json`、`validate-rankup.mjs` 预期），逐处改，再扫一次。
4. **拆分或移动文档**：写计划 JSON，跑 `node scripts/maintain/split-doc.mjs <plan.json>`（自动修相对链接与入站锚点），再跑 `node scripts/maintain/doc-lint.mjs` 到断链为 0；validate 断言与测试引用随内容迁移，不删断言。
5. **一处一份**：判据只在 [`checklists.md`](checklists.md)，操作只在各自文档；缺 check 先补进 `checklists.md` 再去做。
6. **发版**：`node scripts/validate-rankup.mjs` 与相关 `node --test` 通过；版本号 patch 文字与小经验、minor 向后兼容的新工作流、major 目录协议或核心行为破坏性变化；同时改 `SKILL.md` 的 `metadata.version`、`skill.json`、validate 预期与仓库 README。
7. **本 Skill 必须保持项目中立与机器中立**：不带私有出处或身份（站点名、域名、流量数字、account/property ID、本机路径与代理、私有凭据位置）；公开供应商地址与必要的公开来源可保留。回流经验只带走剥离站点后仍成立的规则，由 `scripts/validate-rankup.mjs` 断言。令牌只有一份，放 Skill 根目录 `.env`，环境变量优先（[`discipline.md`](discipline.md) 十一）。
8. **Skill 自己的 `.rankup/`**（git 忽略）只放脚本试跑证据与 `skill-state.json`，`INDEX.md` 只写当前状态；`evidence/` 每个脚本只留最新一次试跑，其余先确认报告与 references 里没有目录名引用，再按Skill的待确认规则取得用户同意后显式纳入按时间删除；`node --test` 也会往这里写试跑证据，跑完测试顺手清。

`evals/trigger-evals.json`（20 条，应触发与不应触发各 10，负例以近似误触为主）定义触发评测；`evals/evals.json` 与 `evals/r1-…`～`evals/r5-…` 五个回归用例目录（skill-creator 用例格式：`prompt.md`、`case.yaml`、`graders/`）定义行为评测。改入口或任务第一站后按 `skill-creator` 的 `run_loop` / 新旧版本对比流程运行。当前评测均未运行过，静态校验不代表行为效果已验证。

## 六、`/rankup doctor`：整理 `.rankup/` 的显式入口

**触发**：在整理项目 `.rankup/` 记录的语境下，「/rankup doctor」「doctor」「整理一下项目记录」「整理一下 rankup」「帮我把这个项目的 .rankup 重新整理」「.rankup 太乱了」。
它就是本章的显式入口：用在一个用了很久、产出很多文档的项目上，一次性把整个 `.rankup/` 与相关记录整理到「只留长远规划和当前进展」。

| 命令 | 回答什么 | 动什么 |
|---|---|---|
| `rankup check` | 现在在哪一段、下一步做什么 | 只读定位，零配额 |
| `rankup review` | 这个站本身有什么问题 | 全站体检，修站 |
| `rankup doctor` | 项目记录还可不可信、好不好接手 | 只整理 `.rankup/` 与根层登记，不碰站点代码与线上 |

**与开工叠加**：doctor 免 `check-version` 与线上三方对账；诊断阶段纯只读免写接力，实际改记录前仍先写，里程碑更新，最后覆盖；禁止改 Skill 的任务即使在源码检出也只给候选文字或允许范围内的 `upstream-candidates.md`。

**编排**（默认对当前项目的 `.rankup/`；对 Skill 源码自身用同一套规则，外加 validate 与 doc-lint）：

0. **先保底**：项目仓库里 `git status` 看 `.rankup/` 是否已提交；未提交或 `.rankup/` 不进 git 时，先把整个目录复制到仓库外的临时目录，路径写进整理报告。可复制命令：`backup_dir=$(mktemp -d); cp -R .rankup "$backup_dir/"`（在项目根执行；受限任务直接复制，不必调用 Git）。
1. **只读诊断**：`node <rankup>/scripts/maintain/rankup-doctor.mjs --project-root . [--portfolio-root <工作区根>]`，再通读 `INDEX.md`、`plan.md`、`decisions.md`、`rejected.md`、`keywords.md` 与最近的 `journal/`；对要动的关键词跑 `ref-scan.mjs`。
2. **经验分拣与回流**（整理里最重要的一步）：遍历 `topics/`、`experience.md`、`checks.md`、项目专属常驻文件、`tasks/briefs/`、`research/` 与非归档 `journal/` 里的坑与推翻记录、`rejected.md` 的复活条件、失败记录（脚本的「经验分拣候选」只列起点，关键词漏报不等于没有经验；归档内容不作新候选），逐条按下文「七」的判定问题序列判归属，输出分拣表：条目｜建议去向（项目层 / 全局层 / 源码层 / 不归本 Skill / 待观察）｜理由｜证据等级。全局层直接按条目格式写入；源码层按「七」的回流方式处理（允许改动的源码检出直接改现有文件，禁止改源码或安装副本只写 `upstream-candidates.md`）；回流过的原条目改成一行指针或删除；待观察的不动。
3. **出整理计划**，每条分进三类之一：
   - **A 安全直接改**：断链、过期接力、已完成任务型条目压成一行、重复事实收成指针、`revived` 行按新口径迁移、过程数据残留（运行 `node <rankup>/scripts/maintain/rankup-clean.mjs --project-root . --apply` 直接删除并改写 md 相对链接）；
   - **B 下沉并保留证据**：超长常驻文件拆分或把过程移进 `journal/` / `research/`，带日期的一次性文件归位，引用同步更新；
   - **C 需要用户决定，只列不动**：备份与临时副本（备份类仍按 C 类，只列不动）、整理后仍超标的文件、删整份文件、改决策或否决的结论、合并或废弃项目、动根层登记表里别的项目、任何拿不准的删除。
4. **执行 A 与 B**：一次改一类；过程数据跑 `node <rankup>/scripts/maintain/rankup-clean.mjs --project-root . --apply`；移动 Markdown 用 `scripts/maintain/split-doc.mjs` 同步出站相对链接与入站链接，归档摘录也要按新位置核对链接；移动文件后立刻 `ref-scan` 同步所有引用；拿不准的不删，只标「待确认」。
5. **回读校验**：再跑 `rankup-doctor.mjs` 与 `doc-lint.mjs --root .rankup`，已处理的 A、B 不再出现，仍超标等拿不准项在报告列为待用户决定，不强行为零；有根层登记时 `projects.json` 条目数与整理前相同，没有则标 N/A；`INDEX.md` 四个导航字段与「接力」仍然完整。
6. **收尾**：`journal/<日期>.md` 写一行（整理了什么、报告在哪）；输出整理报告：改了什么、删了什么（每项能从哪找回）、留了什么、经验分拣表、需要用户决定什么。

**不能丢的东西**（doctor 整理时逐项确认仍在；用户明确按时间清理旧报告时，按 Skill 清理用法执行，需长期保留的报告先列 `.keep-data`）：仍有效的决策及理由、否决行的理由与复活条件、`secrets.md` 元数据、`integrations.md` 接入看板状态、证据路径指向的原始证据、`research/` 报告原文、`experience.md` 条目（已被 Skill 覆盖的可压成写明 Skill 文件与节号的指针）、`scripts/` 及其登记、未完成的接力与在跑的后台任务、用户明确要求保留的内容。

证据路径悬空时，在 `INDEX.md` 标明「原始证据缺失」并保留旧引用原文，不擅自删；由用户决定恢复还是接受缺失。

**破坏性操作规则**：先有备份或 git 可恢复才动；删除只限「能从报告路径或 git 历史找回」的任务型内容；文件移到废纸篓而不是永久删除；不确定的只标注不删。

## 七、三层归属与项目记忆维护规范

| 层 | 位置 | 归属 |
|---|---|---|
| 源码层 | `rankup/` | 对其他用户和项目也成立的方法、命令、脚本与模板；通用规则须过[晋升门](evolution.md#7-通用规则晋升门) |
| 全局层（用户记忆） | `~/.rankup/`（`RANKUP_HOME` 可覆盖） | 跨项目且只对本用户、账号或机器成立的 rankup 规则与本机配置 |
| 项目层（项目记忆） | `<项目>/.rankup/` | 本项目的规则、状态与记录；工作区根的 `.rankup/` 是类型为「组合」的项目层，只登记指针与摘要 |

原编号 ①② 都属项目层，③ 属全局层，④ 属源码层，⑤ 为「不归本 Skill」。浏览器驱动归 opencli，派单归 agent-fleet，外链执行归 backlink，通用 Agent 行为归 Agent 全局规则。doctor 只列建议去向。适用范围重叠时，用户当场指令与全局授权红线优先，其次遵循适用的调度状态、项目规则、全局规则、源码默认。

| 类 | 放什么 | 怎么维护 | 怎么读 |
|---|---|---|---|
| 规则 | 可复用的做法、判据、阈值；`experience.md`、`topics/`、`lessons.md`、`preferences.md` | 查重后原地修订 | 索引常驻，正文按需 |
| 状态 | 当前值；`plan.md`、接力、账号档位、调遣令 | 原地覆盖，标明时效或复查条件 | 启动时读索引，执行前按需回读实时值 |
| 记录 | 事件、用户或授权原话、历史决策、报告、证据 | 追加并按保留期整理 | 调查与整理时按需取证 |

只有规则算记忆。记下下次能照做的动作、确认过的陷阱及其验证方式。单次过程、日期流水、可从环境重读的分支/版本/部署号/清单进记录或直接回读；能用代码、测试或场景挡住的问题去修实现。规则只在原话本身就是必带文字时保留原话。

每条一行，最多两行：

```markdown
- 【实测】<祈使规则>。适用：<条件或范围>。因为：<一句抽象理由>。〔验证：<检查方式>〕〔例：<中立示例>〕〔来源：<记录指针>〕
```

规则与适用必填，理由强烈建议；验证、例、来源可选，各最多一个。含「禁止、一律、从不」务必写适用条件。证据沿用【实测】【经验】【猜测】；【猜测】标待观察与缺失证据，留在项目层，不当结论执行。决策正文中的可复用规则放在「规则」小节或用 `- 规则：` 标记；背景、历史、日期、复查记录和授权原话留在决策记录或 journal。

蒸馏四步：

1. 判断是否会再发生。单次事件写入记录，或略过。
2. 优先用代码、测试或场景防复发；能固化就修实现。
3. 在目标文件搜同主题，已有条目改写其范围、做法或理由；没有才新增。
4. 新增后若超上限，同次合并或删掉一条。

触发点：规则被证伪当场原地修订或删除；用户纠正做法当场按上式蒸馏、原话存记录；同一坑多花一轮以上收尾时蒸馏；每次收尾自问「这单改变了哪条规则」，没有就不写。lint 报重复或超限、跑 doctor、主会话交班时做整理；先对记录核实规则是否仍成立。判断复杂的交 Sonnet 或 Sol。

- 同一条规则在至少两个项目成立，才从项目层晋升全局层；仅一个项目用得上的全局规则下沉。
- 与用户、机器无关的候选先搜源码。已有规则就留指针；缺规则的先进 `upstream-candidates.md`，剥离项目与机器信息并过[晋升门](evolution.md#7-通用规则晋升门)后进源码。当前是允许修改的源码检出时，可当轮复核并改现有文件；安装副本只维护候选。回流完成后原条目改指针或删除。
- 理由失效、已有代码/测试/场景兜住、场景 90 天未使用时清理。索引与总则 ≤60 行，规则文件 ≤150 行，`experience.md` ≤300 行，每项目场景 ≤20 个。其余体积限制见[目录规范](project-memory.md#目录规范常驻文件保留什么去哪里多大)。
- doctor 的记忆 lint 只告警。长引语按同一行至少 40 字识别；日期密度按至少三行且占正文四分之一识别；相似项按规则文本去格式后的双字符片段重叠粗筛。告警用于分拣和蒸馏，记录、报告与证据仍按原有清理流程处理。

全局层首次写入规则时，同步建或更新 `README.md` 索引，列主题、适用范围和文件指针。规则分到 `preferences.md`（偏好）、`lessons.md`（环境经验，单机适用标机器角色）、`upstream-candidates.md`（晋升候选），可通过私有配置仓同步；跨项目脚本放 `scripts/`。`provider-accounts.md` 保存共享面板当前档位等非凭据状态。`config.json` 只存本机项目根与中立性校验配置；秘密放权限 600 的本机 `.env`，两者均不入库。项目层 `.env` 放在 Git 忽略范围内。
