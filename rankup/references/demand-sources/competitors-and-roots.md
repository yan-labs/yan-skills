# 需求数据源 · 竞品下注、站群、子域名监控、社区与词根扩词

> 本文件从 [`demand-sources.md`](../demand-sources.md) 拆出（2026-09-30），含原文 第九、九·二、九·三、九·五至九·八节。来源分流、搜索结果页采集入口、令牌与维护契约仍在主文件。

## 目录

- 九、竞品正在往哪儿下注
- 九·二、一个站背后的整个站群
- 九·三、平台子域名监控（Certificate Transparency）
- 九·八、已经有人替你调研过了（哥飞社区）
- 九·五、从词根出发
- 九·六、自己扩的词表一定漏了一半：必须反查竞品的实际排名词库
- 九·七、跨平台自动补全扩词

## 九、竞品正在往哪儿下注

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| 竞品 sitemap 增量 | 全量 `<loc>` + lastmod，与上次快照 diff 出**新增/消失/更新**，并出 slug 词频 | 纯 HTTP（robots.txt → sitemap → 递归 index → gzip） | 否 | `scripts/demand/sitemap-diff.mjs` |
| 多语种游戏平台清单 | 项目关注市场的游戏平台新内页候选 | `.rankup/demand/game-platforms.json` 批量调用 sitemap 增量脚本 | 否 | `scripts/demand/game-platform-monitor.mjs` |
| Columbus AI 外链榜 | 目录站域名、被多少 AI 工具站引用、DR、dofollow、月访问量 | 纯 HTTP | 否 | `scripts/demand/boards.mjs columbus` |

**sitemap 增量是这一节的主力**：从竞品新增的长尾页面提取候选词与目标 URL，
作为反查素材。默认快照写在 `.rankup/demand/sitemap-snapshots/`（相对当前项目，不写死绝对路径）。

```bash
node scripts/demand/sitemap-diff.mjs --domain <域名> --slug-words
node scripts/demand/game-platform-monitor.mjs --language de,pl,ja,ar,ru
# monitor 逐平台把子进程 stdout/stderr 落进证据目录（2026-08-30）；
# 「候选 0｜失败 N」读法：失败的平台根本没被看过，不是「无新游」。
# → 「对比 <时间>：新增 24 / 消失 0（当前共 1724 条）」+ slug 词频
```

**Columbus 那张榜不是需求源，是外链落地清单**——它排的是「被多少 AI 工具站引用」，
用在 backlink 环节而不是选题环节。

---

## 九·二、一个站背后的整个站群

拆一个站拿到候选方向；**拆站群可以补齐同一主体布局的赛道与页面线索**，
例如图片、视频、音乐、3D、试穿、学术、导航。站点存在与共同指纹只说明发现及关联事实。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| 站群反查 | 同一主体运营的其它候选域名 + 事实字段（共同指纹 / 发现路径 / 回访状态） | 纯 HTTP 读首页 HTML | 否 | `scripts/demand/site-network.mjs --domain <域名> --confirm` |
| Reverse AdSense | 共用同一 AdSense Publisher ID 的所有域名 | OpenCLI 驱动 sitedata.dev | 是（SiteData 会员） | `scripts/sitedata.mjs --domain <域名> --report adsense` |

```bash
node scripts/demand/site-network.mjs --domain <种子域名> --confirm --max 10
```

**Reverse AdSense 是 `site-network.mjs` 的互补手段**：`site-network.mjs` 从首页 HTML 刮指纹，
对不挂 AdSense 的站无效；`sitedata.mjs --report adsense` 走 SiteData 的 Reverse AdSense 数据库，
只要目标域名的 `ads.txt` 声明过 Publisher ID 就能查到所有共用该 ID 的域名——这是 strong 级证据，
且 Ahrefs / Similarweb / Semrush 都没有这个能力。**两者一起跑**：先 `site-network.mjs` 拿指纹，
再 `sitedata.mjs --report adsense` 拿 AdSense 关联，合流去重。
【实测 2026-09-04，`example.com`：pub-XXXXXXXX DIRECT → example.com、example.com、example.com】

脚本只采集不裁定（2026-08-30 起不再输出 strength/confirmed，也不默认过滤弱行）：
每行给出发现路径、共同指纹、回访状态（`revisit=fetch_failed` 是「这次没看到」，
不是「不共享指纹」）。下面这张表是**AI 的判读指引**，不是脚本输出。

**三类指纹的证据等级不一样，别当成一回事**：

| 等级 | 指纹 | 为什么 |
|---|---|---|
| strong | GA4 / AdSense / Clarity / Umami 的账号 ID 相同 | 这些要登录后台才配得出来，撞上基本可断定同一主体 |
| medium | 同一个 `utm_source`，或共享 GTM 容器 ID | utm 说明是同一批推广位，但联盟客也可能带；GTM 容器代理商会给多个客户配同一个 |
| weak | 只有一条外链 | 一条外链谁都能发，**不构成证据** |

**已验证的坑（2026-08-24）**：

- **「无共同指纹」是站群的常态，不是失败。** 成规模的操盘手会给每个站单独建 GA4
  属性（好分开看数据），所以兄弟站之间**根本不共享埋点 ID**。实测某组 10 个兄弟站
  没有一个共享指纹，真正把它们绑在一起的是同一个 `utm_source`。
  判读时别只盯「共同指纹」一列——发现路径里的 utm 同样是证据。
- **没有指纹不等于不是站群。** 服务端埋点、或把 GA 装进 GTM 容器的站，
  首页 HTML 里什么都看不到。空结果的正确读法是「这条路没找到」，不是「它没有兄弟站」。
- CF 挡纯 HTTP 客户端的站取不到，需要时改走 opencli 的真实浏览器把 HTML 喂进去。

拿到站群清单后，保留每个域名的发现路径、共同指纹与回访状态，移交[第十节](validation-chain.md#十候选验证链路)；现行候选裁决只见 [`entry.md`](../playbooks/entry.md#4--判读)。

---

## 九·三、平台子域名监控（Certificate Transparency）

**原理**：Vercel、Cloudflare Pages、Netlify 这类平台的默认子域名（`*.vercel.app`、`*.pages.dev`、`*.netlify.app`）会在签发 TLS 证书时被写入公开的 Certificate Transparency（CT）日志。通过 crt.sh 或 Certstream 监控这些通配域名下的**新增子域名**，就能在一个站还没绑自定义域名、还没做 SEO 之前就发现它。

**为什么有效**：
- 绝大多数新站的第一步是部署到平台默认域名，再等跑通了才买域名绑定——**CT 日志比 Google 收录早几天到几周**。
- 子域名本身就是项目名/产品名，直接构成关键词候选（`photo-resizer.vercel.app` → 关键词 `photo resizer`）。
- 批量出现同一品类的子域名 = 那个品类正在爆发。

**操作**：

| 步骤 | 方法 |
|---|---|
| 单次查询 | `https://crt.sh/?q=%.vercel.app&output=json` — 返回最近签发的证书及子域名列表 |
| 实时流 | Certstream（`certstream.calidog.io`）WebSocket 接口，按 `*.vercel.app` 等通配过滤 |
| 品类聚合 | 把子域名分词后做频率统计，高频词根 = 热门品类（`ai-`、`chat-`、`resume-`） |

暂无脚本——AI 判断 crt.sh 返回的子域名列表，识别品类模式。

---

## 九·八、已经有人替你调研过了（哥飞社区）

前面八节都是**你去挖**。这一节是**别人挖完了，把结论和踩过的坑公开写了出来**——
`new.web.cafe` 上几百人在同一个问题下众筹提问、竞答、按票排名。
成本比自己从零跑一遍榜单低一个量级，而且带着「哪条真的有效」的投票信号。

脚本：[`../scripts/webcafe-forum.mjs`](../../scripts/webcafe-forum.mjs)，
完整接口地图与坑见 [`webcafe-forum.md`](../webcafe-forum.md)。

官方哥飞知识库与 `webcafe-forum.mjs` 的能力边界（哪些只有本地脚本能取、各自的上限与记账）见 [`webcafe-forum.md`](../webcafe-forum.md)「七、站内搜索」末尾的 2026-09-30 核对记录。

| 你要什么 | 命令 |
|---|---|
| 现在有哪些悬赏在问（18 场全站） | `webcafe-forum.mjs bounties --transport http` |
| 一场悬赏的全部答案正文 | `webcafe-forum.mjs bounty <uid> --transport browser --md` |
| **众人投票投出来的网站清单**（征集型） | `webcafe-forum.mjs bounty <uid> --transport browser`（读 `collect.board[]`） |
| **群里到底怎么说的**（原话，不是转述） | `webcafe-forum.mjs chat-search "挖掘需求"` |
| 站内搜经验帖/教程 | `webcafe-forum.mjs search "关键词"` |
| 哥飞的 91 条经验全文 | `webcafe-forum.mjs experiences --pages 10 --transport browser` |

### 已经沉淀进本库的几场

| 悬赏 | 主题 | 已收录到 |
|---|---|---|
| `fd0wrgx7fh` | 你有哪些私藏的挖掘需求的好方法（23 答 / 3760 元） | [`experiences/demand-discovery.md`](../experiences/demand-discovery.md) |
| `fpswv8z126` | 从 0 到 1 哪三件事最重要（19 答） | [`experiences/zero-to-one.md`](../experiences/zero-to-one.md) |
| `il1fmki1ih` | 访客→注册转化率 | [`experiences/conversion.md`](../experiences/conversion.md) |
| `wlhmhdaoqg` | 去哪儿提交外链（**588 条榜单**） | [`../../backlink/references/authorized-data-sources.md`](../../../backlink/references/authorized-data-sources.md) |
| `0jch5yv6g7` | 你都在哪些网站挖掘需求（**盲征中**，109 条待开榜） | 未开榜，`board` 还取不到 |
| `k3ivgzypq1` | 被验证过的找需求方法（**已研究**，37 个方法） | `demand-sources.md` 各分册（13 个新方法已整合进 §四·§六·§七·§八·§九·三·§九·七），完整研究报告见 artifact `db25ad4e` |

**后两场值得盯**：它们正在征集，一旦状态变成 `open` 就能一次性拿到
一百多条「别人实际在用的需求挖掘站点」——那正是 [`demand-sources.md`](../demand-sources.md) 第一节那张表的众包版本。
查状态：`webcafe-forum.mjs bounties --status open --transport http`。

### 三条必须知道的（否则你会拿到空结果且不报错）

1. **匿名不会 401。** 它返回 200 和完整条目，只把正文抹成空串、票数归零。
   判据是正文空不空，不是状态码。
2. **征集型的内容在 `collect.board[]`，不在 `answers[]`。** 只读 answers
   会对着 588 条榜单报「0 条答案」。
3. **`fold_count` > 0 不等于没价值。** `fd0wrgx7fh` 的 23 条里 17 条被折叠，
   而本库收录的最可执行的几条方法恰恰出自被折叠的答案。
   **按票排序读，但别按折叠丢弃。**

### 想要素材就搜群聊，别去问 AI

站内哥飞.ai（`/chat`）的知识库**就是**「哥飞的朋友们」14 个微信群的归档 + 站内教程。
`chat-search` 直接搜那份归档，拿到的是**原话**，不经模型转述；本轮未出现工具箱每日配额扣费显示，会员访问限制仍存在。
需要综合归纳时使用官方 `knowledge_ask`。本地 `ask` 仅保留历史或用户显式指定的专用用途（默认 dry-run，要 `--send`），不用于 review 或代做研究，也未验证免费。

---

## 九·五、从词根出发

前面九节都是「先有站/先有信号，再有词」。这一节是反方向：**先有词根，扩成候选串，再去撞盘面。**

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| 工具类词根库（51 条） | 词根 + 中文释义 + 常见搭配 + 8 个扩展模板 | 已固化成本地 JSON | 否 | `scripts/demand/word-roots.mjs` + `data/word-roots.json` |

```bash
node scripts/demand/word-roots.mjs list                       # 全部词根
node scripts/demand/word-roots.mjs seeds                      # 只要词根本身，喂给面板查询
node scripts/demand/word-roots.mjs expand converter \
  --seeds pdf,image --target word                             # 按 8 个模板扩展
```

扩展模板覆盖 `x-root` / `root-x` / `online` / `free` / `ai` / `a-to-b` / `best` / `bare` 八种形态。

### 两条必须一起记的约束

1. **扩展出来的是候选串，不是已验证关键词。** 它们尚无验证证据——
   把「我扩出了 300 个词」当成「我找到了 300 个词」是这条路上最常见的自欺。
   脚本刻意在输出末尾打了这句提醒。**下一步必须过第十节。**
2. **词根库全是英文，这是整个社群共同的盲区。** 中国人搜「JSON 编辑器」不搜
   「JSON editor」。**词根 × 语言**的乘法会让量倍增——这正是只有 agent 跑得动的部分，
   也是目前最没被人挖的一片矿。

> 更大的扩展词根表（社群流传的百条版）实测**取不到**：非公开分享链接，
> 登录后表格是 canvas + WebSocket 渲染，试遍 export / meta / data 端点与全局对象都无解析路径。
> 需要时人工在表格里「下载为 CSV」，落进项目侧而不是 Skill。

---

## 九·六、自己扩的词表一定漏了一半：必须反查竞品的实际排名词库

【实测】按某一个维度把种子扩成几十个带量词，很容易自认为覆盖完整。
反查同赛道竞品的实际排名词报表（每站取前 100 词）之后，发现**整整三类构词一个都没有**：

| 漏掉的构词类型 | 例子形态 | 为什么会漏 |
|---|---|---|
| **泛型入口词** | 去掉限定语的那个大词，及其同义写法 | 自己先入为主判定「头词太难，不收进池子」，于是连量都没测 |
| **问句 / 信息词** | 「这个东西怎么算」「多少算够」「X 有多重」 | 扩词时想的是「用户会怎么称呼这个对象」，不是「用户会怎么问这件事」 |
| **口语与拼写变体** | 缩写、词序颠倒、**拼错的写法** | 没人会主动去想用户拼错了怎么办，但那些变体确实有量 |

补测之后，同一难度档的池子从几十词翻到一百多词，量接近翻倍。

反查对象、扩词补漏与工作量边界只见 [P2「五个取数动作与编排」](../playbooks/research/p2-keyword-root.md#五个取数动作与编排探索循环)。

| 采集什么 | 操作入口 | 保留什么 |
|---|---|---|
| 竞品实际排名词库 | `backlink/scripts/semrush-report.mjs` 排名词报表；也可按官方 [`seo-webcafe.md`](../seo-webcafe.md) 接口取词 | 域名、国家库、日期、词与目标 URL、已有词池差集及采集状态；移交 P2 |

### 品牌截流词（Brand Keyword Hijacking）

竞品的品牌词是一座被大多数人忽视的词矿：B2B SaaS 领域 **35–45% 的品牌 SERP 首页上有第三方内容**（`[brand] alternative`、`[brand] vs`、`[brand] review`、`[brand] pricing`）。

操作：
- 从第二节收集到的竞品列表中，取每个品牌名，构造 `[brand] alternative`、`[brand] vs [你的产品]`、`[brand] review`。
- 品牌修饰词与发现来源一并移交 [P2](../playbooks/research/p2-keyword-root.md#五个取数动作与编排探索循环)，意图核验只见 [`seo-serp.md`](../seo-serp.md#逐问法-google-读法)。
- 比较/替代页规划只见 [`stage-2-positioning.md`](../lifecycle/stage-2-positioning.md)。

**限制**：这是一个有争议的策略。只有在产品确实能替代竞品时才应该做，否则是误导用户。页面内容必须是真实的对比，不是纯粹的截流。

---

## 九·七、跨平台自动补全扩词

搜索引擎和平台的自动补全（autocomplete / suggest）可采集查询表达与构词线索，建议列表不提供已核实月量。

### 两个核心手法

**1. keywordtool.io — 16 个平台的自动补全聚合器**

一次输入种子词，同时从 Google、YouTube、Bing、Amazon、eBay、Play Store、Instagram、Twitter、Pinterest、TikTok 等 16 个平台拉取自动补全建议。免费版只看词不看量，但足以发现**你完全没想到的构词角度**——因为不同平台的用户用不同的方式描述同一个需求。

**2. Alphabet Soup（A–Z 前缀穷举）**

在 Google / YouTube / Amazon 的搜索框里输入 `[种子词] a`、`[种子词] b`、……`[种子词] z`，收集每一轮的下拉建议。这个技巧的价值在于**强制搜索引擎给出 26 个方向的建议**，而直接输入种子词只给 8–10 个最热的。

| 变体 | 前缀形式 | 适合发现什么 |
|---|---|---|
| 后缀法 | `种子词 a/b/c…` | 修饰语、使用场景、长尾 |
| 前缀法 | `a 种子词`、`b 种子词` | 品牌名、形容词、替代表述 |
| 填空法 | `种子词 _ 种子词2` | 中间连接词、介词搭配 |

### 操作建议

- 种子词取自第二节（需求信号源）的已验证关键词，不要凭空想。
- 对比多个平台的建议差集，保留平台与实际措辞；意图核验只见 [`seo-serp.md`](../seo-serp.md#逐问法-google-读法)。
- 批量操作可用 keywordtool.io，单次深挖用 alphabet soup 手动做（或 AI 通过搜索框自动化）。

| 源 | 拿什么 | 取数方式 | 需登录 | 脚本 |
|---|---|---|---|---|
| Google / Bing / DuckDuckGo 搜索框下拉 | 三引擎各自的联想串（按 `--hl` 语种 `--gl` 国家分市场，utf-8） | 纯 HTTP 公开端点，零配额零钥匙；失败引擎为 `null` 并逐引擎落 manifest | 否 | `scripts/demand/suggest.mjs "<词根>" --engine google,bing,ddg --hl <hl> --gl <gl> --json`（alphabet soup：对 `"<词根> a"`…`z` 循环跑） |

keywordtool.io 那一档仍无脚本——AI 手动做或用 `/anysearch` 补 Amazon / YouTube 平台的差集。

---

