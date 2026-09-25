# 让便宜模型替 agent 点浏览器（JEV 动作选择器）

## 先说结论

- **上游 OpenCLI 没有「内置模型驱动浏览器」这个功能。** 2026-09-25 核对过：`jackwener/opencli`
  v1.8.8 之后的 50 个提交（已合进我们 fork，CLI 1.11.0 / 扩展 1.3.0）全是 adapter、安全升级和清理，
  代码里没有任何 LLM 端点、`ANTHROPIC_API_KEY`/`OPENAI_API_KEY` 或 baseURL 配置。
  上游 README 里的 "Browser Use" 指的是**外部 agent**（Claude Code 之类）调用 `opencli browser` 原语。
- 同一作者 2026-09-17 另开了 **`jackwener/opencli-mcp`**（独立仓库、独立扩展、Native Messaging，
  不依赖 OpenCLI）。它也**不内置模型**，模型是 MCP 客户端本身；省 token 的点在它的 `js` 工具：
  一次调用跑多步 JS（相当于我们的 `batch` + 条件逻辑）。要不要装它是另一个决定，本 Skill 不覆盖。
- 真正能「让便宜模型操作浏览器」的，是我们自己把 **JEV 接成动作选择器**：agent 只给目标，
  循环里每一步由 JEV 从页面可点元素里挑下一步。已实测可用，见下文。

## JEV 是什么，不是什么

TypeSafe 的 System One 决策模型：只对已枚举好的动作集合做校准概率判断，不生成文本、
不调工具，只能在「选一个」而不是「想怎么做」的场景里替代 agent。协议细节、`choice`/
`noul`/`score` 三种题型、价格和 `judge` 命令用法统一见
[`../agent-fleet/skill/SKILL.md`](../../agent-fleet/skill/SKILL.md) 的「JEV 判断模型」一节，
这里只记录把它接成浏览器动作选择器这一具体应用的设计和实测。

## 早期实测（2026-09-25，演示脚本，已被 auto 命令取代）

目标「从 example.com 到 IANA 的 Root Zone Management 页」，会话 `opencli-sync-test`，`OPENCLI_WINDOW=isolated`：

| 步 | 页面 | 候选数 | JEV 选择 | confidence | 目标达成概率 |
|---|---|---|---|---|---|
| 1 | example.com | 2 | Learn more | 0.99 | 0.01 |
| 2 | iana.org/help/example-domains | 15 | 指向 /domains 的链接 | 0.74 | 0.03 |
| 3 | iana.org/domains | 39 | 指向 /domains/root 的链接 | 0.87 | 0.13 |
| 4 | iana.org/domains/root | 38 | DONE | 1.00 | 0.99 |

4 次 JEV 调用共 3,876 输入 token（约 $0.00016），agent 侧只消耗启动脚本和读最终结果那一轮。
同样的事让 agent 自己逐步 `state` → 读 → `click`，每步要把 1–3k token 的页面树读进上下文。

## 怎么用（现在等价的命令）

演示脚本已删除；同样的事现在用正式子命令做：

```bash
# 密钥只从环境变量读，绝不打印、不写进命令行参数或文件
S=my-task-$(date +%s)
opencli browser "$S" open https://example.com
opencli browser "$S" auto --goal "目标用一句英文写清楚" --max-steps 6
opencli browser "$S" close
```

`auto` 每步记录一次 JEV 选择（候选数、choice、confidence、耗时、token），
`--min-confidence` 默认 0.55，低于阈值自动停下交回人工。会话名照第三节纪律起，
用完 `close`；专用窗口池满时默认 `OPENCLI_WINDOW=isolated`，不会等池。完整参数、
四道安全闸门和已知限制见下方「更彻底的接法」一节。

## 什么时候用它代替 agent 逐步点

| 适合交给 JEV | 仍由 agent 自己做 |
|---|---|
| 多层导航：目标页要点 2–6 层链接/菜单才到 | 要输入文字、填表、选日期 |
| 列表里挑一项（「点最新那篇」「点 Settings」） | 需要看图/截图判断 |
| 每步只是「点哪个」，动作可枚举 | 提交、付款、删除、发送等不可逆动作（一律 agent 确认） |
| 批量重复同类导航（每个站点都要找到某设置页） | confidence 低、页面不稳定、登录墙 |
| 判断「到了没 / 是否报错 / 是否登录墙」这类是非题 | 最终结果核对与汇报 |

原则：**JEV 负责便宜的「选」，agent 负责贵的「想」和「确认」**。已有 adapter 或固定脚本的，
仍优先走 adapter/脚本（第零节），JEV 循环是「没有现成路径、但每步只是挑一个链接」时的中间档。

## 更彻底的接法：`opencli browser <session> auto`（已实现，2026-09-26）

上一节的脚本原型证明了可行性；`feat/jev-auto` 分支（CLI 1.12.0，源码
`src/browser/auto/*.ts`，`src/cli.ts` 只加最小的命令注册，尚未合入 `fork/main`，
先 `git fetch fork` 确认合并进度）把它做成了 daemon 原生子命令，复用已有的
snapshot/getFormState/click/fillText/setChecked，省掉每步起一个 CLI 进程，
并且把「填表」也纳入了同一个循环——不再只是点链接。

### 用法

```bash
opencli browser <session> auto --goal "<目标>" \
  [--data payload.json]        # JSON 对象，JEV 语义映射到表单字段，值不编造
  [--max-steps 20]             # 步数上限
  [--min-confidence 0.55]      # 低于这个置信度就停，交回人工
  [--allow-submit]             # 放行提交/支付/发送/删除/确认/创建账号类点击
  [--confirm-terms]            # 放行 terms/consent/隐私政策复选框
  [--dry-run]                  # 只预览下一步会选什么，不执行
  [--json]                     # 额外打印完整结构化结果
```

每一步：`snapshot()` + `getFormState()` → 生成候选（可点元素 + 待填的
fill/select/check 字段 + DONE）→ 一次 JEV `choice` 调用 → 执行 → 记录到
`StepLog`。新出现的表单字段第一次遇到时，先花**一次批量 JEV 调用**把所有
分组语义映射到 `--data` 的 key（不是每个字段单独调用），之后同一个字段
不会重复问。退出码区分三种情况：完成（0）、停下待人工（75，`--min-confidence`
过低、`--max-steps` 耗尽、`awaiting_submit`、`captcha_detected`、
`login_wall_detected`、`submit_unverified`、`dry_run` 都算这一档）、出错（1）。

### 四道安全闸门

这是从「玩具脚本」变成「敢接到 backlink 外链提交流水线上」的前提条件，逐条都是
从真实使用场景（backlink 已有的三道闸：不解验证码、不建账号、不勾条款）和真机
测试里补的，不是纸面设计：

1. **不可逆点击过滤**（`safety.ts`）：中英文关键词（提交/支付/发送/删除/确认/
   创建账号/注册等）+ `type=submit`，命中且没传 `--allow-submit` 时直接从 JEV
   候选菜单剔除——模型不会被给选它未曾被提供的选项。`create account`/`sign up`/
   `注册`是真机测试一个签约表单时补的：一个没写 `type` 属性的 `<button>Create
   account</button>` 一开始完全没被识别成不可逆，会被无限重复点击（因为点击不
   改变页面状态，JEV 下一步又选中同一个候选）。
2. **CAPTCHA/Turnstile 检测**（`page-gates.ts`）：每步一次零 JEV 成本的确定性
   DOM 探针，选择器移植自 backlink 的 `safe-fill.mjs`（`[class*="captcha" i]`
   /`data-sitekey`/`iframe[src*="recaptcha"]` 等 + 文本兜底）。命中就停
   （`stopReason: captcha_detected`），没有解验证码的代码路径。
3. **登录墙检测**（`page-gates.ts`）：`form[action*="login" i]` 或
   `input[type="password"]`，命中就停（`login_wall_detected`），不建账号、
   不输密码。
4. **terms/consent 复选框硬禁区**（`terms-guard.ts` + `field-groups.ts`）：
   关键词命中「terms/consent/privacy policy/同意/条款/隐私政策」的 checkbox
   分组，没有 `--confirm-terms` 时**整组**不进入候选菜单——不是「JEV 找不到
   匹配的 data key 所以选 NONE」这种隐式保护，是从根上不给选。对齐 backlink
   `known-forms.md` 里 `termsCheckbox` 字段的同一条策略（"always stages, never
   ticks it, unless --confirm-terms"），只是这里没有 per-domain 的 recipe，
   用的是通用关键词。

### 提交后结果校验：不信任 JEV 自己的 DONE

`--allow-submit` 放行的点击一旦命中不可逆关键词（`action.isSubmitLike`），
执行后 `run.ts` 立刻跑一次确定性的双证据校验（`outcome-check.ts`，移植自
backlink 的 `lib-submit-outcome.mjs`），把这一次运行的终态直接定下来，
不再等某一步 JEV 选中 DONE 的自我报告：

- **正向证据**：我们的 URL（来自 `--data` 里的 `url` 字段）或「感谢/已提交/
  等待审核」这类文案出现在**表单之外**的区域；
- **负向证据**：提交表单还在、还回显着刚填的值、表单内有校验错误标记、或
  URL/标题都没变（还站在提交页上）。

只有「正向成立且没有任何负向」才是 `submitted`（对应 `status: completed`）；
其余（`submitted-inconclusive`/`submitted-unconfirmed`/`outcome-unknown`）
一律 `status: stopped_for_human`、`stopReason: submit_unverified`，交人工看。
这个设计存在的理由和 `lib-submit-outcome.mjs` 完全一样：**「页面上出现了我们的
URL」不是判据**，因为一个校验失败的表单常常会静默重渲染、把刚提交的值原样
回填进 `<input value>`——朴素的全文关键词扫描会把这种情况误判成成功。JEV 会
额外问一次 `noul`（"看起来像成功了吗"）附在结果的 `jevAssist` 里仅供参考，
不参与这个分类。

### 真机实测（2026-09-26，会话 `jev-auto-test`，用完 `close` 释放）

| 场景 | 结果 |
|---|---|
| 导航：example.com → IANA Root Zone Management 页 | 4 步全自动完成，4 次 JEV 调用，4010 输入 token（约 $0.00017），~5.5s |
| 填表：httpbin.org/forms/post，`--data` 的 key 故意和字段名不同（`name`→`custname`、`phone`→`custtel`、`email`→`custemail`、`pizza_size`→size 单选、`toppings`→topping 多选、`notes`→comments），不带 `--allow-submit` | 全部语义匹配正确并填入，未匹配的 `delivery` 字段正确跳过并注明 `no_matching_data_key`，正确停在 `awaiting_submit` |
| 同上，带 `--allow-submit` | 点击 Submit order，`extract` 核对 httpbin 回显的 JSON 里字段值与填入值一致；同一站点在**重复大量测试**之后出现过点击未触发导航的情况（httpbin 侧限流/连接老化嫌疑更大，非首次单次操作复现），outcome-check 正确识别为证据不足并停在 `submit_unverified` 交人工，而不是误报成功——这正是这个校验存在的意义 |
| CAPTCHA 检测：本地测试页含 `class="g-recaptcha" data-sitekey="..."` | 0 次 JEV 调用，1 步内停在 `captcha_detected` |
| 登录墙检测：本地测试页 `<input type=password>` | 0 次 JEV 调用，1 步内停在 `login_wall_detected` |
| terms 复选框：本地测试页含「I agree to the Terms of Service and Privacy Policy」+「Create account」按钮 | 复选框正确排除出候选并记入 `termsCheckboxesBlocked`；「Create account」在补齐关键词前会被无限重复点击（见上），补齐后正确识别为不可逆并停在 `awaiting_submit` |

对比：同样的「导航 4 步」如果让 agent 自己 `state` → 读 → `click` 循环，
每步要把 1-3k token 的页面树读进 agent 自己的上下文（Claude token，比 JEV
输入 token 贵一个数量级）；「填表 6 字段 + 提交」如果全程由 agent 现场判断
字段映射，至少也是 6-10 轮工具调用的 agent token，而 `auto` 这一段总共
只花了个位数次 JEV 调用。

### 已知限制

- **`--min-confidence` 默认阈值对「多个字段都可以先填、顺序不重要」的长表单
  偏严**：httpbin 六字段表单上，JEV 对着 4-5 个同样合法的候选时概率会打散到
  0.25~0.35，没有一个单选能过默认的 0.55——这不是选错了，是「选哪个都对，
  只是没有强烈偏好」。`run.ts` 已经改成「取 JEV 自身 confidence 和候选里所有
  fill/select/check 候选累计概率质量两者较大值」来缓解误停，但如果场景里
  同时有大量互不冲突的候选，仍可能需要按同一个 `--data` 重跑几次——这是安全
  的，因为 `auto` 每步会读页面的实时 DOM 值/checked 状态，不会对已经填对的
  字段重复操作，重跑只会继续填剩下的。
- **不可逆关键词是黑名单，不是白名单**：新站点用了列表之外的措辞（比如某种
  小众语言的「提交」）不会被拦。已经因为真机测试补过一次（账号创建类），
  预期还会有类似的补丁需要，遇到就加。
- **无文件上传**：`ActionKind` 目前只有 `click/fill/select/check/done`，
  OpenCLI CLI 层本身的 `upload` 原语没有接入 `auto`。
- **非原生下拉不支持**：`select-by-ref.ts` 只处理真正的 `<select>`，
  Radix/shadcn/MUI 一类自定义下拉组件不行。
- **字段映射结果不落盘复用**：`mappedGroupKeys` 只在单次进程运行内存活，
  没有对齐 backlink `known-forms/<domain>.json` 的 recipe 机制——同一个域名
  下次再跑 `auto` 要重新花一次 JEV 调用做字段映射（成本很低，但不是零）。
- **无批量/多会话编排**：`auto` 是单会话单目标命令，N 个待办站点开 N 个会话名
  仍需外层脚本按 `adapter-phpld.mjs` 的 `sessionFor(url)` 模式手动派生。
- **无 ledger/evidence 钩子**：`auto` 不认识 backlink 的台账格式，也不会像
  `safe-fill.mjs`/`inspect-page.mjs` 那样在失败/完成分支落一对证据到
  `--evidence-dir`——这是有意的：`auto` 保持通用，接台账是调用方（比如
  backlink 侧的薄封装脚本）的事。
- **无表单级预筛**：候选构建按 `formRefs` 逐字段展开，没有先判断「这个
  form 值不值得进入候选」（比如排除掉明显是订阅框而不是提交表单的情况）。
- **`state` 文本格式的固有歧义**：`dom-snapshot.ts` 的属性序列化不给多词值
  加引号（`placeholder=Your name` 而不是 `placeholder="Your name"`），
  `auto` 自己的 `snapshot-parse.ts` 用「找下一个 `key=`」的方式尽力猜边界，
  不是精确解析——已知会在「多词值后紧跟一个裸标志属性」这种罕见排列上出错，
  文档在 `snapshot-parse.ts` 内注释里。

以上除「不可逆关键词黑名单」和「`state` 格式歧义」是设计取舍外，其余都是
`yan-skills/opencli/references/jev-migration-plan.md`（外链提交流水线迁移
方案，第 5.2 节）盘点出的能力缺口，按优先级排序，接入 backlink 外链提交场景
前先看那份文档。
