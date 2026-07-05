---
name: gt
description: Google Trends 查询 + SEO 选词工作流引擎。四个基础查询：关键词热度对比曲线、地区热度分布、相关飙升查询、每日热搜榜；三套工作流：小语种/小国市场竞争力探测、模糊关键词多角度扩词并收敛成可做站的 SEO 词、新兴趋势捕捉。用户提到 谷歌趋势、Google Trends、搜索热度、热度对比、搜索趋势、关键词趋势、trending、"XX 和 YY 哪个更火"、"XX 搜索量怎么样"、"今天美国/日本在搜什么"、"这个词能不能做站"、"哪个市场/国家有机会"、"帮我选 SEO 关键词"、"这个方向值不值得做"、选词、选品调研、市场探测 时使用本 skill。即使用户只说 /gt 或只给了一个模糊的产品词/方向，也应触发。不要自己手写 pytrends 代码或直接调 opencli——本 skill 的脚本已处理好 venv、urllib3 兼容性和路由。
---

# gt — Google Trends 查询与 SEO 选词工作流

两层能力：**基础查询**（四个子命令）和**工作流**（把查询串成决策）。用户问单点问题走基础查询；用户给的是模糊方向、要选词选市场时，走工作流。

## 基础查询

| 用户想要 | 子命令 | 数据源 |
|---|---|---|
| 热度对比 / 趋势曲线 / "XX 和 YY 哪个火" | `compare` | pytrends |
| 地区分布 / "哪个国家搜得多" | `region` | pytrends |
| 相关词 / 飙升查询 / "大家搜 XX 时还搜什么" | `related` | pytrends |
| 今日热搜 / "美国现在在搜什么" | `hot` | opencli |

脚本位于本 skill 目录下的 `scripts/gt.py`（以下示例用 `$GT` 代指，实际执行时替换为 skill 的 base directory + `/scripts/gt.py`）：

```bash
python3 $GT <子命令> [关键词...] [选项]

# 热度对比（默认全球、近 12 个月，>30 行自动按月聚合）
python3 $GT compare ChatGPT Claude Gemini
python3 $GT compare "wireless charger" --geo US --time 5y
python3 $GT compare sunscreen --time 2024-01-01:2025-12-31 --geo AU

# 地区分布（不带 --geo 按国家列，带 --geo 按州/省列）
python3 $GT region "remove background" --top 15

# 相关查询（单关键词；rising=飙升词，top=高频词）
python3 $GT related Claude --geo US

# 每日热搜榜（走 opencli，未安装 opencli 则此命令不可用，其余三个不受影响）
python3 $GT hot --region JP --limit 10
```

选项速查：`--geo`（US/JP/ID…，留空=全球，任意 ISO 国家码都行）、`--time`（1m/3m/12m/5y/all 或 起:止 日期）、`--raw`（compare 不聚合）、`--top N`、`--region`/`--limit`（仅 hot）。

## 关键约束（路由和解读时必须知道）

- **数值是 0-100 归一化的相对值**，100 = 所选范围内峰值。某小国 100 ≠ 搜索量大，只代表"占该国总搜索的比例高"。绝对量要靠 keyword-research skill / Keyword Planner 收口。
- **Trends 只反映需求侧**，看不到竞争侧（SERP 排名难度、广告出价）。"潜在竞争力 = 需求 ÷ 竞争"，gt 只给分子。
- **关键词语言要匹配地区**：查德国用德语词、查日本用日语词。用户给中文词但查英语区时，先翻译再查。
- **compare 一次最多 5 个词**；多于 5 个分簇查，同簇内才可直接比较。
- **hot 不支持 CN**（无大陆 feed），建议 TW/HK，或改用 agent-reach 查微博/百度热搜。
- **429 限流**：连续查询过快会被拒；工作流里每次调用间隔几秒，被限就等 1-2 分钟。
- 太冷门的词在小国会返回空数据——这本身就是信号（需求不足）。
- 首次运行 compare/region/related 会自动建 venv（~/.cache/gt-skill/venv），约 30 秒。

## 工作流

### W1 · 小语种/小国市场竞争力探测

输入：一个产品关键词。产出：值得做的市场清单 + 内容语言决策。

1. **全球扫描**：`region <词> --time 12m --top 15` → 圈出 over-index 的国家（相对热度高 = 该国用户格外关心这个需求）。
2. **趋势健康度**：对每个候选国 `compare <词> --geo <国> --time 5y` → 只留上升或平稳的市场，衰退的淘汰；顺便记录季节性。
3. **语言决策**：同一国家内 `compare "本地语词" "英语词" --geo <国>` → 哪个赢就做哪种语言的内容。不要想当然——实测中印尼用户搜 "remove background"（英语）反而压过 "hapus background"（本地语）。
4. **挖本地搜法**：`related <词> --geo <国>` → rising 词往往是当地真实长尾，回填候选词表。
5. **收口**：把幸存词交给 **keyword-research** skill 查绝对搜索量和关键词难度，才能下"竞争力"结论。

### W2 · 模糊关键词 → 可做站的 SEO 词（扩词 → 验证 → 收口）

输入：用户只给一个模糊词或产品方向（如"图片处理"）。产出：一张可执行的选词决策表。

**第一步：多角度扩词（发散）。** 调用以下 skill，各自从不同角度产出候选词，汇成 3-6 个词簇（每簇 ≤5 个词，正好一批 compare）：

- **brainstorming** → 先澄清：产品到底解决什么问题、目标用户是谁。扩词前置，防止方向跑偏。
- **marketing-psychology** → 买家心理角度的词：痛点词（"photo too blurry"）、对比词（"X vs Y"、"X alternative"）、决策词（"best X"、"X free"）。
- **marketing-ideas** → 使用场景/人群角度的词：不同职业、不同平台、不同用例的搜法。
- **ai-seo** → 问句型和 AI 搜索引擎偏好引用的 query 形态（"how to X without Y"）。

**第二步：用 gt 验证（收敛）。**

1. 每簇 `compare ... --time 5y`：淘汰长期衰退的词，标注上升词。
2. 对幸存词 `related`：rising 列表里常有比原词更好的变体，发现了就回填词簇再比一轮。
3. 对最终幸存词 `region`：标注每个词的机会市场（可衔接 W1 深挖）。

**第三步：收口与交付。**

1. **keyword-research** skill → 查绝对搜索量、难度、竞争度，定主词 + 长尾组合。
2. 选定词后建站阶段 → **seo-geo**（站内优化、schema、传统+AI 搜索）和 **ai-seo**（被 LLM 引用的内容策略）接棒。
3. 给用户的最终产出用这张表：

| 词簇 | 代表词 | 趋势(5y) | 机会市场 | 建议语言 | 下一步 |
|---|---|---|---|---|---|

> 这些 skill 不可用时（比如换了环境），自己顶上做扩词即可，角度不变：痛点/对比/场景/问句四个方向。

### W3 · 新兴趋势捕捉

- `related` 的 **rising 列表是最强信号源**：+several-thousand-% 的词 = 正在起飞的需求。
- 疑似新词 `compare <新词> <类目老词> --time 12m` → 判断是昙花一现还是持续爬坡（连续 3 个月以上抬升才算数）。
- `hot` 只用于时效性话题，不作为选词依据。

## 输出处理

脚本输出 markdown 表格，可直接引用。回答用户时：

1. 先给结论（谁更火、趋势方向、哪个市场有机会），再贴数据表。
2. compare 指出峰值和拐点（脚本末尾已给峰值行）；解读时提醒数值是相对值。
3. 工作流产出优先用 W2 的决策表格式，让用户能直接行动。
4. 用户要图表时，用已有输出数据画，不要重复查询。
