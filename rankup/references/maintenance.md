# 维护：在使用中顺手维护 Skill 与项目 `.rankup/`

**系统必然熵增。** 文档越用越多、结论会被推翻、脚本会改名、任务做完会留下流水；没人维护，下一个会话读到的就是过期结论。
所以维护**不靠隔一段时间开专门任务**，而是每次正常使用时顺手做：读到就清、改了就扫、收尾必走。
本章是维护动作的唯一源；`SKILL.md`「强制流程」表、[`project-memory.md`](project-memory.md) 的接力协议与目录规范都指向这里。
使用者的全局 Agent 规则若另有「实时更新与清理」条款，两者一致；有出入时以更严的一条为准。

**定位**：`.rankup/` 是承上启下的工具，只管**长远规划**与**当前进展**，不是日志容器。
事实原地修订（[`project-memory.md` 核心原则](project-memory.md#核心原则这是一部-wiki不是一本日志)），过程与流水不进来。

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
| ② 结论原地修订 | 按下文「四」更新决策类文档：推翻的原地改写（删旧写新，不注释旧文、不写“旧的作废”，Agent 记忆同理，见 [`agent-memory.md`](agent-memory.md)），否决写理由与复活条件，重复的收成一处；本轮新经验按「七」判归属（项目 / 用户全局 / Skill） | 同一结论只有一处全文，其余是指针 |
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
| 备份与临时文件 | 证据与备份的待确认核查、用户确认及显式删除参数统一见 [SKILL.md 清理用法](../SKILL.md) | `rankup-doctor.mjs` |
| 目录外文件 | 顶层文件（含合法根层与已登记项目专属文件）都在[目录规范](project-memory.md#目录规范常驻文件保留什么去哪里多大)里；带日期的一次性文件归入 `research/` 或 `journal/` | `rankup-doctor.mjs` |
| Skill 文档体积 | references 单文件 > 600 行或 > 80 KB 就拆，主文件留入口与判据 | `doc-lint.mjs`；拆用 `split-doc.mjs` |

**必须保留（精华）**：长远目标与定位、当前进展与下一条动作、仍有效决策及原因、否决方向及复活条件、可复用脚本与入口登记。

判不准是不是精华时，问一句「新会话少了这句会不会走错路」，不会就删；删的是**能从报告路径或 git 历史找回**的内容。

## 四、决策与结论类文档怎么维护

适用 `keywords.md`、`rejected.md`、`decisions.md`、`research/`、`plan.md`、`checks.md`、`journal/`、`INDEX.md`，以及工作区根层的 `portfolio.md`、`projects.json`。

1. **新证据推翻旧结论 → 原地修订**：到结论最初写下的地方改写，写明「此前认为 X，<日期> 发现 Z，现改为 Y」并指向证据；不在别处并列一条新说法。`decisions.md` 用 `superseded` 状态保留旧决定、链接新条目。
2. **否决（`rejected.md`）**：每行必须有一句理由和可判定的复活条件。复活条件满足时，把该行**移出表格**，在 `decisions.md` 写新条目（引用原否决理由与已满足的条件），并在 `rejected.md` 末尾「已复活」一节留一行指针（对象、日期、DEC 编号）。超上限时先归档已复活或已过期的条目，保留否决理由、复活条件与证据指针，不硬删；仍超标就标注待用户决定。旧口径「原行保留、状态改 revived」停用，已有的 revived 行在下一次 doctor 时按新口径迁移。
3. **已完成的任务型内容**：只留一行「结论 + 报告路径」（报告在仓库外或 `research/` 里）。
4. **同一结论多处出现**：以一处为准，其余改成指针。优先级：`decisions.md` > `keywords.md` / `rejected.md` > `topics/` > `INDEX.md` 摘要。
5. **过期数据**：带观察日期（时效契约）；过了可信区间的重新核实，或明确标「待核实」，或删除。
6. **`research/` 报告**：原文只增不改，它是证据；结论被推翻时只在报告顶部加一行「已被 <日期> <文件或 DEC> 推翻」。
7. **`journal/`**：已记录的判断原文不改写（被推翻时从推翻它的地方反向链接）；但逐步操作、命令输出、一次性 brief 这类流水按「三」压缩成结论加依据，不无限堆积。归档按原观察日期命名 `journal/YYYY-MM-DD-archive-<主题>.md`，超标拆成同日多篇，不改日期凑上限。
8. **根层 `portfolio.md` / `projects.json`**：阶段、线上状态、下一步与项目内 `INDEX.md` 一致。回写 `projects.json` 前把原文件复制到 `.rankup/` 之外（或确认已在 git 里），用 `jq '… |= …'` 就地更新，改后比对条目数：`jq '.projects | length'`（按实际结构取数组或对象键数）前后必须相等，不等立即恢复。历史上一次 `select` 管道把 17 条塌成 1 条。备份统一按「三」的 C 类口径处理；没有根层登记时此项标 N/A，不创建登记表。doctor 只报当前条目数，执行者须把整理前后计数写进报告。

按时间清理多个项目：`node <rankup>/scripts/maintain/rankup-clean.mjs --workspace <工作区> --older-than 7d --apply`；不指定 `--older-than` 默认7d，历史trash同样按mtime；不指定 `--apply` 只预览。时间筛选额外覆盖 research/journal/reports/evidence 的报告和临时脚本；常驻文件、白名单、state 保留；证据与备份走 [SKILL.md 清理用法](../SKILL.md) 的待确认流程，历史 trash 也遵守同一规则。

## 五、维护 Skill 源码（rankup 本身）

1. **可复用操作落成脚本**：在授权修改范围内，把确定会重复的链路本轮参数化并跑通，省掉下轮重写；只读或禁止改脚本的任务仅列候选。具体判定：会再做一次、换个站或词或日期就要重跑、驱动登录态浏览器超过约 5 步、同一串命令本轮手敲 2 次以上，满足任一条就在本轮存成脚本。动手前先查本 Skill `scripts/`、backlink `scripts/`、opencli adapter 与跨项目登记表（`registry.mjs list`），有就用，不好用就修；没有就把第一次跑通的链路当场写成参数化脚本：通用的放本 Skill `scripts/<动词-对象>.mjs`，头部注释写用途、参数、登录态依赖、已知坑、验证日期；只属于某个项目的放 `<project>/.rankup/scripts/` 并登记进 `INDEX.md`。写完用真实参数跑一次，没跑通不算沉淀。登录态、property ID、账号配置只作参数或项目侧配置。
2. **经验回流**（「把这个经验写进 rankup」）：先按 [`experiences/INDEX.md`](experiences/INDEX.md) 定证据等级与归属层，再按 [`evolution.md`](evolution.md) 晋升门判进 Skill 还是留项目；进 Skill 的写进**对应的现有文件**，不带站名与数字；同一条已有就更新旧条目的日期与内容，不另起一条；改完跑 `node scripts/validate-rankup.mjs`，直接提 main（多会话共用工作树时只提 rankup 相关文件，不用 stash / reset）。面板与网页操作口径的修正先过 [`discipline.md`](discipline.md) 十五的五层分诊。
3. **改术语、路径、阈值、脚本名**：先 `ref-scan.mjs` 全量扫描（Skill 全目录、仓库 README、`skill.json`、`validate-rankup.mjs` 预期），逐处改，再扫一次。
4. **拆分或移动文档**：写计划 JSON，跑 `node scripts/maintain/split-doc.mjs <plan.json>`（自动修相对链接与入站锚点），再跑 `node scripts/maintain/doc-lint.mjs` 到断链为 0；validate 断言与测试引用随内容迁移，不删断言。
5. **一处一份**：判据只在 [`checklists.md`](checklists.md)，操作只在各自文档；缺 check 先补进 `checklists.md` 再去做。
6. **发版**：`node scripts/validate-rankup.mjs` 与相关 `node --test` 通过；版本号 patch 文字与小经验、minor 向后兼容的新工作流、major 目录协议或核心行为破坏性变化；同时改 `SKILL.md` 的 `metadata.version`、`skill.json`、validate 预期与仓库 README。
7. **Skill 自己的 `.rankup/`**（git 忽略）只放脚本试跑证据与 `skill-state.json`，`INDEX.md` 只写当前状态；`evidence/` 每个脚本只留最新一次试跑，其余先确认报告与 references 里没有目录名引用，再按Skill的待确认规则取得用户同意后显式纳入按时间删除；`node --test` 也会往这里写试跑证据，跑完测试顺手清。

`evals/trigger-evals.json` 与 `evals/evals.json` 分别定义触发与行为评测；需要时按 `skill-creator` 的 `run_loop` / 行为对比流程运行。当前两套评测均未运行过，静态校验不代表行为效果已验证。

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
2. **经验分拣与回流**（整理里最重要的一步）：遍历 `topics/`、`experience.md`、`checks.md`、项目专属常驻文件、`tasks/briefs/`、`research/` 与非归档 `journal/` 里的坑与推翻记录、`rejected.md` 的复活条件、失败记录（脚本的「经验分拣候选」只列起点，关键词漏报不等于没有经验；归档内容不作新候选），逐条按下文「七」的判定问题序列判归属，输出分拣表：条目｜建议去向（① / ② / ③ / ④ / ⑤ / 待观察）｜理由｜证据等级。③ 直接写入用户全局层；④ 按「七」的回流方式处理（允许改动的源码检出直接改现有文件，禁止改源码或安装副本只写 `upstream-candidates.md`）；回流过的原条目改成一行指针或删除；待观察的不动。
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

## 七、经验分层与回流：四层归属（唯一判定表）

项目里长期使用会沉淀大量经验（某站用 OpenCLI 操作常失败的坑、调研时反复推翻自己的结论……）。每条经验都要落到**唯一**的去处；[`evolution.md`](evolution.md) 与 `SKILL.md` 只指向这里。**先判「这条经验属于谁」**：项目、用户全局层、rankup 源码、别的 Skill、还是 Agent 全局规则。Rankup 不收不属于自己链路的经验。

| 层 | 位置 | 放什么 | 不放什么 | 上限 |
|---|---|---|---|---|
| ① 项目事实 | `<project>/.rankup/` 各专题文件 | 本项目的事实、决策、证据与数字 | 可跨项目复用的规则 | 见[目录规范](project-memory.md#目录规范常驻文件保留什么去哪里多大) |
| ② 项目稳定经验 | `<project>/.rankup/topics/`、`experience.md` | 在本项目多次复用有效、但未证明跨项目成立的规则 | 只发生一次的操作细节（→ `journal/`） | 见目录规范（300 行 / 24 KB） |
| ③ 用户全局层 | `~/.rankup/`（环境变量 `RANKUP_HOME` 可覆盖）：`preferences.md`（个人默认与偏好：目标市场与语种默认、常用工具与会话约定、跨项目通用的个人决策口径）、`lessons.md`（只在这台机器或这个账号上成立的环境坑）、`upstream-candidates.md`（等维护者回流 Skill 的候选）；已有的 `config.json`（`projectRoots`）保留 | 只对这个用户或这台机器成立、跨项目通用、且与 rankup 相关的规则 | 某个项目的事实；Agent 通用行为规则；任何密钥 | 每个 `.md` ≤ 200 行 / 16 KB，同样适用「三」的清理判据 |
| ④ Skill 源码 | `rankup/references/`（方法层与 `experiences/` 经验层）、`scripts/`（脚本头部「已知坑」） | 与 rankup 的流程、链路、章节、判据或 rankup 自己的脚本相关，别的用户和项目也会遇到，且通过 [`evolution.md` 晋升门](evolution.md#7-通用规则晋升门) 的规则 | 站点名、账号、本机路径、个人偏好 | 单文件 600 行 / 80 KB |
| ⑤ 别的 Skill 或 Agent 全局规则 | 对应 Skill（浏览器驱动与会话 → `opencli`；多模型派单与后台任务 → `agent-fleet`；外链执行 → `backlink`……）或用户的 Agent 全局规则与记忆 | 不属于 rankup 链路的经验 | —— rankup 不收；doctor 只在分拣表写去向与候选文字，**不改别的 Skill 文件或全局规则文件**，由用户或对应 Skill 的维护流程处理 | — |

**判定问题序列**（按顺序问，第一个「是」就停）：

0. 这条经验属于 rankup 的链路吗（调研、建站、上线、获客、变现、项目记录，或 rankup 自己的脚本）？不是 → ⑤：浏览器驱动、扩展与会话故障归 `opencli`（按它自己的分诊流程）；派单、后台任务通知归 `agent-fleet` 或 Agent 全局规则；终端、shell、代理这类与 rankup 无关的本机环境问题归 Agent 全局规则或记忆；只有「这台机器上跑 rankup 流程才会撞到」的本机坑才进 ③。
1. 只对本项目成立（换个站就不成立，或离开本站数字就没意义）？→ ①；在本项目反复验证过、下次能直接照做 → ②。
2. 跨项目成立，但只对这个用户或这台机器成立（本机环境、账号档位、个人偏好与默认口径）？→ ③。
3. 先在 Skill 文档与脚本头注中 `rg` 核对是否已有同一规则；已覆盖 → 原条目改为准确的文件与节号指针，不重新走晋升门。未覆盖再判断：与 rankup 的流程、链路、章节或判据本身有关，别的用户和项目也会遇到，证据够（至少【实测】并过晋升门）？→ ④：先剥离站点名、账号、本机路径（项目中立规则），再走晋升门与 validate。
4. 拿不准 → 留在 ①②，标「待观察：<还缺什么证据>」；同一经验在 ≥ 2 个项目复现后再升格。

**证据等级**：每条回流都带出处与等级【实测】/【经验】/【猜测】；【猜测】不当结论执行，也不回流到 ③ ④。

**③ 与 Agent 全局记忆的边界**：③ 只放 rankup 相关的个人规则（例如「新站默认先做美国英语」「某面板共享账号的会话名约定」「这台机器 curl 要走代理」）；派单、汇报格式、工具偏好这类 Agent 通用行为规则归 Agent 自己的全局规则文件与记忆，③ 不重复。优先级：用户在对话里的明确要求 > Agent 全局规则 > ③ > ④ 的默认值；③ 覆盖 ④ 某条默认时，在 ③ 那条旁注明「覆盖 Skill 默认：<哪条>」。

**怎么读**：开工时读 `$RANKUP_HOME`（默认 `~/.rankup/`）下的 `preferences.md` 与 `lessons.md`；目录或文件不存在就跳过，不报错，也不预先创建空文件，首次写入时才按需创建。Skill 源码里不写任何用户层的具体内容（机器中立，validate 断言 Skill 目录里没有这几个文件）。

**示例**（一个活跃项目 `INDEX.md` 接力里的「坑」一行，2026-09-30 分拣）：

| 条目 | 去向 | 理由 | 证据等级 |
|---|---|---|---|
| OpenCLI 扩展重启后可能断开，需要唤醒 Chrome | ⑤ `opencli` | 浏览器驱动与会话故障，环境类，按 opencli 的分诊流程处理；rankup 不收 | 【经验】单项目 |
| PageSpeed 网页版需要标签页可见；dedicated 专用窗口可出分 | 已覆盖，改指针 | 2026-10-04 修订：见 `scripts/pagespeed.mjs` 头注，默认 dedicated；不要求抢用户前台窗口 | 【实测】2026-10-04 brief 提供的本机证据，本轮未重跑 |
| 后台 `&` 启动的派单任务不给完成通知 | ⑤ `agent-fleet` / Agent 全局规则 | 与 rankup 链路无关，是派单与后台任务的使用约定 | 【经验】 |
| shell 的 `for` 循环在 token 压缩代理下报 parse error | ⑤ Agent 全局规则（或 ③ `lessons.md`，若只影响 rankup 命令） | 本机环境问题，不属于 rankup 流程 | 【实测】本机 |

分拣完：已覆盖那条只改指针；⑤ 的三条在分拣表里给出去向和候选文字，不去改那些文件；原 `INDEX.md` 那一行删掉，只在报告里留分拣表。

**回流怎么写**（doctor 的第 2 步，平时收尾也适用）：

- 去 ③：写进 `preferences.md` 或 `lessons.md`，一条一行 `- **[YYYY-MM-DD] 结论**：依据（出处，等级）`；已有同一条就更新，不另起一条。
- 去 ④：先看当前 Skill 目录是不是**源码检出**（Skill 目录或上级仓库根有 `.skill-source` 标记；doctor 只读检查标记，不调用 Git）。是且任务允许改源码：按晋升门与「五」第 2 条写进对应现有文件，跑 validate；否，或任务禁止改源码（普通安装副本更新会覆盖改动）：只追加到 `$RANKUP_HOME/upstream-candidates.md`（已剥离项目信息，写明建议落点文件、证据与等级），不改安装副本。
- 回流后：原项目条目改成一行指针（「已回流到 <位置>，<日期>」）或删除，不两处各存一份。
- 待观察的不动，只在原条目上标注。

