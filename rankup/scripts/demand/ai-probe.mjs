#!/usr/bin/env node
/**
 * 用途：「AI 探针」——对一个关键词，用真实 AI 问答产品重复提问，量化「AI 会推荐谁」。
 *   Google 系数据（KD、量、SERP）看不到发生在 AI 对话里的需求；本脚本补这一块：
 *     ① 推荐名单、顺序、引用/检索到的域名、AI 自己给的理由与弱点；
 *     ② 追问型：把 Google 前 3 名摆给它，问「会不会推荐、不足在哪、什么新产品能当第一推荐」；
 *     ③ 多次重复的稳定度（名单 Jaccard、Top1 一致率）；
 *     ④ 与 Google 前 10 的域名重合；
 *     ⑤ AI 给每个推荐打的类型标签（dedicated_product / listicle_blog / marketplace / big_platform…），
 *        仅记录类型计数，不自动给出推荐位判决。
 *   适用产品：付费工具、游戏站、平台类——凡是「用户会直接问 AI 要推荐」的需求。
 *
 * 示例（<...> 换成自己的词和目录；--out 指向仓库外的任意目录）：
 *   node scripts/demand/ai-probe.mjs \
 *     --topic "<目标关键词>" \
 *     --need-prompt "<只描述用户想做的事、不含关键词的真人式提问> Which one would you pick first?" \
 *     --keyword-prompt "What is the best <目标关键词>? Recommend specific products and tell me which one you'd pick first." \
 *     --reps 3 --out <输出目录> --fetch-google
 *   # 已有 Google 前 10：--google-top "a.com,b.com,c.com,..."（按名次），或 --google-serp-file serp.json
 *   # 只看会发什么、不花额度：加 --dry-run
 *   # 网页版 ChatGPT（用户已登录的 chatgpt.com；默认临时聊天独立于账号记忆，见「通道」）：
 *   #   node scripts/demand/ai-probe.mjs --topic "<目标关键词>" --need-prompt "..." --out <目录> \
 *   #     --channel chatgpt-web --reps 1 --no-followup            # 未确认记忆状态：输出顶部标「未确认无记忆污染，仅供参考」
 *   #   ……再加 --memory-clean                                    # 用户确认临时页隔离；旧普通路径须确认账号干净
 *
 * 参数：
 *   --topic <词>            必填。目标关键词（也用于 Google SERP 抓取与输出命名）。
 *   --need-prompt <文本>    必填。N 型：只描述用户想做的事，文本里**不要**出现关键词。
 *   --keyword <词>          K 型用的词，默认同 --topic。
 *   --keyword-prompt <文本> K 型完整提问；不给则用通用模板（推荐自己写得像真人提问）。
 *   --reps <n>              N 与 K 各重复几次，默认 3。
 *   --out <目录>            必填。原始证据与汇总的落点（**放仓库外**：原始 JSON 不进 git）。
 *   --google-top <域名,域名> 可选。Google 前 10 域名（按名次）；用于追问与重合度计算。
 *   --google-serp-file <f>  可选。opencli google search -f json 的输出文件（带标题，追问更自然）。
 *   --fetch-google          没给上面两项时，用 `opencli google search` 现抓一次前 10（只读，需 Chrome）。
 *   --channel <c>           codex（默认）| chatgpt-web。见下方「通道」。
 *   --multi-turn            仅 chatgpt-web：每个 N/K 样本在同一临时页自然提问并追问，不加 PROBE/搜索包装，不做 C 型。
 *   --turns <整数>           多轮总轮数，任意正整数，默认 3；轮间至少等 8 秒，全部读完才关页；失败保留轮次、不重发。
 *   --turn2-prompt <文本>   默认 Why did you recommend that one first, and what are its weak points?
 *   --turn3-prompt <文本>   默认 Is there anything better out there that you'd recommend instead? What would a better product need to do?
 *   --followup "文本"        可重复，依次定制第 2、3、4…轮；未给的轮交替用默认两句。
 *   --keep-open             仅 chatgpt-web 且 reps=1：采样后保留页面并打印会话名。
 *   # 三轮预览：--channel chatgpt-web --multi-turn --kinds K --reps 1 --dry-run
 *   # AI_PROBE_WEB_WINDOW 覆盖临时页窗口模式，默认 dedicated。raw 的 turns 保存各轮原文、域名、耗时与状态。
 *   --temporary             chatgpt-web 默认开启：dedicated 临时页发送，DOM 读取回答与来源；--no-temporary 用旧路径。
 *   --kinds <N,K,C>         仅执行指定类型，默认 N,K,C；单措辞采样可用 --kinds N，避免 reps 翻倍。
 *   --followup-prompt <文本> C 型完整提问，替代 Google 前三模板。
 *   --memory-clean          仅 chatgpt-web：**用户已确认**临时页隔离（旧普通路径须确认账号干净）才传。不传则记 memoryClean=unknown，
 *                           summary.json / summary.md / 每条 raw 顶部都标「未确认无记忆污染，仅供参考」。脚本不会替你改账号设置。
 *   --followup / --no-followup  是否做 C 型追问（默认做 1 次）。
 *   --effort <low|medium>   codex 通道推理强度，默认 low。
 *   --model <name>          codex 通道模型，默认 gpt-6-sol。
 *   --concurrency <n>       codex 通道并发数，默认 3（chatgpt-web 强制 1）。
 *   --gap-ms <ms>           相邻两次发起之间的最小间隔，默认 codex 2000 / chatgpt-web 随机 30000–90000（显式设置覆盖）。
 *   --timeout-s <秒>        单次提问超时。codex 默认 300；chatgpt-web 默认 150（指「发送成功后」轮询会话数据的最长时间，
 *                           超时即失败并给出会话号，不重发、不无限重试）。
 *   --web-session <名>      仅 chatgpt-web：读会话数据用的 opencli browser 会话名，默认 ai-probe-web（描述性名字，别用 $$）。
 *   --web-search            已弃用、被忽略（opencli 的开关在新版 chatgpt.com 上必失败）；网页通道改为在提示词末尾写 “Use web search.”。
 *   --alias <a=b,c=d>       把同一产品的多个域名折成一个再算名单（例如 old.example=new.example）；只影响汇总，原始记录不改。
 *   --resume                同一 --out 下已有 ok 的记录则跳过（限流/中断后续跑）。
 *   --dry-run               只打印将发送的提问（含 channel、memoryClean 元数据），不发。
 *   --summarize-only        不发提问，只用 --out/raw 里已有记录重算 summary（判据改了之后重跑用；
 *                           memoryClean 取自各条 raw 的记录，不看本次命令行——「确认」只在采集当时有意义）。
 *
 * 通道（channel）：
 *   codex        本机 Codex CLI（`codex exec --json`，gpt-6-sol）。每次提问 = 全新进程 + **全新的空 CODEX_HOME**
 *                （仅软链 auth.json，写最小 config.toml，--ephemeral，空工作目录）。
 *                为什么必须空 CODEX_HOME：默认 ~/.codex 带有 AGENTS.md 与 memories/，实测（2026-09-29）
 *                一个「你记得我什么」的探测会把用户的产品/SEO/项目细节全吐出来——用默认 home 跑探针，
 *                推荐结果会被用户本人的上下文污染。空 home 的同一探测只返回时区等环境信息。
 *                能拿到的证据比网页版多：--json 事件流里有每次联网搜索的 queries 和命中结果（域名/标题/URL）。
 *                ≠ 网页版 ChatGPT 产品；只能说「Codex/GPT 侧联网推荐」。
 *   chatgpt-web  经 OpenCLI 驱动用户**已登录**的 chatgpt.com。需要用户先在 Chrome 里登录网页版；
 *                本脚本不登录、不输入任何凭据、不改账号设置、不点「不个性化」。
 *                默认临时页路径（2026-10-11）：URL 含 temporary-chat=true 且页面有临时声明/横幅即放行，不依赖个性化菜单，
 *                经 browser type/click 发送、DOM 读完整答案与直接引用链接；未做 payload 核验。
 *                以下是 --no-temporary 旧路径的历史说明：账号开了全局记忆时普通聊天会读记忆
 *                （实测 memory_scope=global_enabled，一个「你记得我什么」的探测原样吐出了用户的居住地/职业/持仓等个人信息）。
 *                所以脚本启动时会打印显式警告；没传 --memory-clean 时，输出 memoryClean=unknown 并在 summary.md / summary.json
 *                顶部标「未确认无记忆污染，仅供参考」。要做正式采样，请用未开记忆的干净账号并由用户确认后再传 --memory-clean。
 *                传了 --memory-clean 但会话 payload 里 memory_scope 仍是 global_enabled 时，脚本会警告「声明与页面矛盾」，
 *                并把矛盾写进 summary（不改标记，只提示）。
 *                实现（2026-09-29 新版 chatgpt.com 适用）：
 *                  ① `opencli chatgpt ask "<提示词> Use web search." --new --wait false`——只借它发送并取 conversationId；
 *                     不传 --web-search（开关有 5 层故障、加号按钮 testid 已消失，必失败），联网靠提示词里的 “Use web search.”；
 *                  ② `opencli browser ai-probe-web eval`：在 chatgpt.com 页内 fetch /backend-api/conversation/<id>（令牌只在页内用，
 *                     不打印、不落盘），每轮页内轮询最长 40 秒，脚本外层再循环到 --timeout-s（默认 150 秒）硬截止；
 *                  ③ 完成判定看会话数据：沿 current_node 链，最后一条 assistant、content_type=text、recipient=all、
 *                     status=finished_successfully、end_turn=true 且正文非空；不看页面选择器（新版页面已没有 opencli 适配器依赖的选择器）；
 *                  ④ 取回：答案正文、模型名、memory_scope、web.run 检索命中（search_result_groups）、引用来源（content_references：
 *                     items / sources / safe_urls / turnNsearchM 标记回查命中）。
 *                网页通道拿不到「搜索词」（payload 里工具调用消息正文为空），所以 firstQueryNamesPickShare 对网页通道恒为 null。
 *
 * 登录态依赖：
 *   codex 通道：本机 codex 已登录（~/.codex/auth.json 存在）；--fetch-google 需要 OpenCLI + Chrome。
 *   chatgpt-web 通道：OpenCLI + Chrome 里 chatgpt.com 已登录。
 *
 * 产出（--out 目录）：
 *   raw/<N|K|C>-<rep>.json         每次提问的完整记录（提问、channel、memoryClean、耗时、是否联网 searched、检索词 searches、
 *                                  检索命中 retrieved[{domain,url,title}]、引用来源 cited[{domain,url,title,via}]、答案、解析出的名单；
 *                                  网页通道另有 conversationId 与 web{memory_scope,model,conversationUrl,…}，失败记录也带会话号）
 *   raw/<N|K|C>-<rep>.events.jsonl codex 通道的原始事件流（证据，不进 git）
 *   raw/<N|K|C>-<rep>.answer.md    答案原文
 *   google-serp.json               抓到/传入的 Google 前 10
 *   summary.json                   机器可读汇总（banner、memoryClean、memoryScopesSeen、稳定度、Top1 一致率、与 Google 重合、
 *                                  引用来源分布 citedDomainFrequency、首次回答外部产品点名率）。memoryClean：网页通道 unknown|user-confirmed；
 *                                  codex 通道恒为 n/a-isolated-codex-home（空 CODEX_HOME，无账号记忆）。
 *   summary.md                     人读摘要（网页通道且未确认记忆时，第一行就是「未确认无记忆污染，仅供参考」）
 *   退出码：0 全部成功；2 参数错误；3 有提问失败（限流/登录失效/超时，已记录，可 --resume 续跑）。
 *
 * 已知坑（都踩过）：
 *   - **不要在 codex 通道里用默认 ~/.codex**（见上，记忆/指令污染）。脚本自己造空 home，别改成复用。
 *   - 空 home 里仍会带的环境信息：时区、cwd、日期。联网搜索的结果还受本机出口 IP 的地区影响。
 *   - 单轮提问带了固定的「探针尾巴」（--multi-turn 不带）（要求先自然作答，再在 ---PROBE--- 之后给一行 JSON：名单/类型/弱点/空白）。
 *     这会让模型多讲「弱点」，与用户的自然提问略有不同；N/K 三组用同一尾巴，组间可比，绝对值别当真实分布。
 *   - 模型「联网」不等于「靠联网发现」：codex 通道看事件流里有没有 web_search 项判断是否联网；
 *     2026-09-29 三个词 21 次全部联网，且**每一次首轮搜索词里就已带上最终推荐的产品名**
 *     （firstQueryNamesPickShare=1）——候选是模型凭训练记忆先选好的，搜索用来核实价格/官网。
 *     所以「新产品能不能被推荐」首先取决于它在不在模型的先验里，其次才是检索排名。
 *   - 域名自报（probe JSON 里的 domain）可能幻觉：与文本链接、检索命中域名交叉；脚本对不上的标 unverified。
 *   - opencli chatgpt 的 `--web-search` 开关在新版 chatgpt.com 上必失败（加号按钮 testid 已消失、菜单只渲染 3 项等 5 层故障）
 *     ——脚本已不再传它（旧的 --web-search 参数被忽略），
 *     改在提示词末尾写 “Use web search.”。是否真的联网看会话 payload：有没有带命中的 web.run 工具消息（searched / searches）
 *     和引用（cited），不要看开关。模型对「Reply exactly: ok」这类也会带一条空的 web.run 消息，脚本不把它算联网。
 *   - opencli 的 chatgpt 适配器（本机 2026-09-29 版）读不到新版网页 DOM（ask 发送成功但收不到回答 TIMEOUT、
 *     detail/read 报 EMPTY_RESULT）——所以网页通道只借它发送（--new --wait false），回答走页内 payload，完成判定看会话数据。
 *     隐藏窗口（默认 dedicated 池满时、background）下 composer 不可见，发送用 --window isolated；读 payload 只需同源 fetch，
 *     用 dedicated 专用窗口的 opencli browser 会话即可。修 opencli 属另一件事，本脚本不动它。
 *   - 网页通道每提问一次就在用户的 ChatGPT 历史里留一条对话（含 N/K 探针提问），脚本不删除；批量采样会污染历史。
 *     `site:chatgpt` 是 opencli 适配器的持久会话，同一账号下并发的第二个 ask 会排队，脚本已把 chatgpt-web 强制为串行。
 *   - 网页版对英文提问可能用中文作答（账号语言/记忆迹象）；脚本不加「Answer in English」，以免偏离自然提问，解析不受影响。
 *   - 网页通道超时（默认 150 秒）就失败并把会话号写进错误与 failures，不重发；回答可能仍在生成，可手动打开该会话查看，
 *     或对同一 --out 加 --resume 重跑（只补失败项，会新发一条对话）。
 *   - Google 前 10 来自用户 Chrome 的 `opencli google search`：带用户所在地区与个性化，不是干净的 gl=us；
 *     要严格对照请传 --google-top（例如 官方 gefei CLI serp 的结果）。
 *   - n 很小（默认每型 3 次）：稳定度只能说「这次探针里」，不是统计结论。
 *
 * 已验证日期：2026-09-29。
 *
 * 实测记录（2026-09-29，本机 codex-cli 0.158.0 / gpt-6-sol low / 并发 3；原始证据留在仓库外，不随 skill 分发）：
 *   - codex 通道：三个词（付费工具类、游戏类、平台类各一）各 N×3 + K×3 + C×1，共 21 次全部成功，
 *     单次 50–82 秒（均值约 61 秒），无 402/429；另用 --fetch-google 跑了一遍端到端小样（各 1 次）。
 *   - chatgpt-web 通道（旧版实现，带 --web-search）：N×2 + K×1 成功（74–181 秒/次，页内 payload 读到 45–53 条检索命中、
 *     memory_scope=global_enabled），带 --web-search 的 K 型两次都败在「找不到工具菜单按钮」。
 *   - chatgpt-web 通道重写后（不传 --web-search、提示词末尾 “Use web search.”、页内读会话数据判完成）：
 *     一个工具类词 N-1 + K-1 各 1 次，均成功，各约 51 秒；检索命中 44/48 条、引用来源 6/5 条（content_references，via=marker），
 *     模型 gpt-5-6-thinking，payload memory_scope=global_enabled（未传 --memory-clean，输出顶部带「未确认无记忆污染，仅供参考」）。
 *     另用假 opencli 桩测了超时/认证失败/发送失败/输出不可解析四条失败路径（不重发、认证类立即停、错误带会话号）。
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './_lib.mjs';
import { lockChatgpt, reserveConversation, checkExit, randomMs } from './_chatgpt_guard.mjs';
import { checkSessionHealth, regDomain, oc, parseEvalJson, classifyWebSend, failedPage, sendTurn as runTemporaryChat, closeSession, browserCommand, manageSession } from './_chatgpt_web.mjs';
export { regDomain, parseEvalJson } from './_chatgpt_web.mjs';

// ───────────────────────── 域名工具 ─────────────────────────

// 同一产品的多个域名（例如官方域名 + 旧域名/子域名）折成一个：--alias "old.example=new.example,a.com=b.com"
let ALIASES = {};
export function setAliases(str) { ALIASES = {}; for (const pair of String(str || '').split(',')) { const [a, b] = pair.split('=').map((x) => regDomain(x.trim())); if (a && b) ALIASES[a] = b; } }
export const canon = (d) => ALIASES[d] || d;

const URL_RE = /https?:\/\/[^\s)\]>"'<，。]+/g;
export function urlsIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(URL_RE)) out.push(m[0].replace(/[.,;:!?)]+$/, ''));
  return out;
}
const uniq = (a) => [...new Set(a.filter(Boolean))];

// 列表页/博客榜单的启发式：只记录 URL 类型占比
const LISTICLE_RE = /(\/blog\/|\/blogs\/|\/articles?\/|\/best[-_/]|\/top[-_]?\d*|\/alternatives|\/vs[-_/]|\/compare|\/guide|\/review|\/roundup|\/list)/i;
const LISTICLE_HOSTS = /(^|\.)(medium\.com|reddit\.com|quora\.com|pcmag\.com|techradar\.com|zapier\.com|forbes\.com|g2\.com|capterra\.com|producthunt\.com|youtube\.com|wikipedia\.org|substack\.com|linkedin\.com|tomsguide\.com|cnet\.com|theverge\.com)$/i;
export const looksLikeListicle = (url) => { try { const u = new URL(url); return LISTICLE_RE.test(u.pathname) || LISTICLE_HOSTS.test(u.hostname); } catch { return false; } };

// ───────────────────────── 提问构造 ─────────────────────────

const PROBE_PREFIX = 'You are answering a real user\'s question. Do not read or write any files and do not run shell commands. Use web search whenever it helps you give a current, accurate answer, and say so honestly if you did not search.\n\nUser question:\n';
const TAIL_RECO = '\n\nAnswer the way you normally would, concisely. Then, after a line containing only ---PROBE---, add ONE single-line JSON object exactly like: {"searched_web": true or false, "recommendations": [{"rank": 1, "name": "", "domain": "", "kind": "dedicated_product|marketplace|big_platform|listicle_blog|other", "reason": "", "weakness": ""}], "cited_domains": [], "market_gap": ""}. Keep the whole reply under 25 lines.';
const TAIL_FOLLOW = '\n\nAnswer concisely. Then, after a line containing only ---PROBE---, add ONE single-line JSON object exactly like: {"searched_web": true or false, "verdicts": [{"domain": "", "would_recommend": true or false, "reason": "", "weakness": ""}], "my_first_pick": {"name": "", "domain": ""}, "new_product_wins_if": [], "market_gap": ""}. Keep the whole reply under 25 lines.';

// 网页通道不再传 opencli 的 --web-search 开关（新版页面上必失败），联网靠提示词末尾的这一句
export const WEB_SEARCH_SUFFIX = '\n\nUse web search.';

export function wrap(kind, body, channel = 'codex') {
  return PROBE_PREFIX + body + (kind === 'C' ? TAIL_FOLLOW : TAIL_RECO) + (channel === 'chatgpt-web' ? WEB_SEARCH_SUFFIX : '');
}

export function followupBody(keyword, top) {
  const lines = top.slice(0, 3).map((t, i) => `${i + 1}. ${t.domain}${t.title ? ` - "${t.title}"` : ''}`).join('\n');
  return `When people search Google for "${keyword}", the top results are:\n${lines}\n\nIf a user asked you for the best "${keyword}", would you recommend each of these? For each one say yes or no, why, and what its weaknesses are for that user. Then tell me who you would actually pick first, and what a NEW dedicated product would need to offer for you to recommend it as your first pick.`;
}

// ───────────────────────── 解析答案 ─────────────────────────

// 网页版答案里的引用标记是私有区字符包起来的（cite…turn…），文本里看不见但会污染解析
export const cleanText = (t) => String(t || '').replace(/\uE200[^\uE201]*\uE201/g, '').replace(/[\uE000-\uF8FF]/g, '');

export function splitProbe(rawText) {
  const text = cleanText(rawText);
  const idx = String(text || '').indexOf('---PROBE---');
  if (idx === -1) return { answer: String(text || '').trim(), probe: null, probeError: 'no ---PROBE--- marker' };
  const answer = text.slice(0, idx).trim();
  const rest = text.slice(idx + '---PROBE---'.length).trim();
  const start = rest.indexOf('{');
  const end = rest.lastIndexOf('}');
  if (start === -1 || end === -1) return { answer, probe: null, probeError: 'no JSON after marker' };
  try { return { answer, probe: JSON.parse(rest.slice(start, end + 1)), probeError: null }; }
  catch (e) { return { answer, probe: null, probeError: `JSON parse: ${e.message}` }; }
}

/** 从一条记录里得到「推荐名单」：优先 probe JSON，其次文本里的链接顺序 */
export function extractReco(rec) {
  const linkDomains = uniq(urlsIn(rec.answer).map((u) => canon(regDomain(u))));
  const retrieved = new Set((rec.retrieved || []).map((r) => canon(r.domain)));
  const p = rec.probe;
  let list = [];
  let source = 'none';
  if (p && Array.isArray(p.recommendations) && p.recommendations.length) {
    list = p.recommendations.map((r, i) => ({ rank: Number(r.rank) || i + 1, name: r.name || '', domain: canon(regDomain(r.domain || '')), kind: r.kind || '', reason: r.reason || '', weakness: r.weakness || '' }))
      .filter((r) => r.domain).sort((a, b) => a.rank - b.rank);
    source = 'probe-json';
  } else if (p && Array.isArray(p.verdicts)) {
    // 追问型：先看 my_first_pick，再看 would_recommend=true 的
    const first = p.my_first_pick?.domain ? [{ rank: 1, name: p.my_first_pick.name || '', domain: canon(regDomain(p.my_first_pick.domain)), kind: '', reason: 'my_first_pick', weakness: '' }] : [];
    const yes = p.verdicts.filter((v) => v.would_recommend).map((v, i) => ({ rank: first.length + i + 1, name: '', domain: canon(regDomain(v.domain)), kind: '', reason: v.reason || '', weakness: v.weakness || '' }));
    list = [...first, ...yes.filter((y) => !first.some((f) => f.domain === y.domain))];
    source = 'probe-verdicts';
  } else if (linkDomains.length) {
    list = linkDomains.map((d, i) => ({ rank: i + 1, name: '', domain: d, kind: '', reason: '', weakness: '' }));
    source = 'text-links';
  }
  // 交叉验证自报域名：出现在文本链接或检索命中里才算 verified
  for (const r of list) r.verified = linkDomains.includes(r.domain) || retrieved.has(r.domain);
  return { list, source, linkDomains };
}

// ───────────────────────── codex 通道 ─────────────────────────

function codexHome() { return process.env.CODEX_HOME_SRC || path.join(os.homedir(), '.codex'); }

function makeCleanCodexHome(model, effort) {
  const src = path.join(codexHome(), 'auth.json');
  if (!fs.existsSync(src)) throw new Error(`找不到 ${src}：本机 codex 未登录`);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-probe-codexhome-'));
  fs.symlinkSync(src, path.join(home, 'auth.json'));
  fs.writeFileSync(path.join(home, 'config.toml'), `web_search = "live"\nmodel = "${model}"\nmodel_reasoning_effort = "${effort}"\napproval_policy = "never"\nsandbox_mode = "read-only"\n`);
  return home;
}

function classifyFailure(text) {
  const t = String(text || '');
  if (/402|payment required|insufficient|quota|usage limit/i.test(t)) return 'quota-402';
  if (/429|rate.?limit|too many requests/i.test(t)) return 'rate-limit';
  if (/login|log in|sign in|unauthorized|401|token.*(expired|invalid)|not logged/i.test(t)) return 'auth';
  if (/model.*(not supported|unsupported|not available|does not exist)/i.test(t)) return 'model';
  return 'other';
}

function parseCodexEvents(jsonl) {
  const searches = [];
  const retrieved = [];
  let finalText = '';
  let usage = null;
  let threadId = null;
  for (const line of jsonl.split('\n')) {
    if (!line.trim()) continue;
    let e; try { e = JSON.parse(line); } catch { continue; }
    if (e.type === 'thread.started') threadId = e.thread_id;
    if (e.type === 'turn.completed') usage = e.usage || null;
    const it = e.item;
    if (!it) continue;
    if (e.type === 'item.completed' && it.type === 'web_search') {
      const queries = it.action?.queries?.length ? it.action.queries : (it.query ? [it.query] : []);
      searches.push({ queries, preSited: queries.length > 0 && queries.every((q) => /\bsite:/i.test(q)), resultCount: (it.results || []).length });
      for (const r of it.results || []) retrieved.push({ domain: regDomain(r.domain || r.url), url: r.url || '', title: r.title || '' });
    }
    if (e.type === 'item.completed' && it.type === 'agent_message' && it.text) finalText = it.text;
  }
  return { searches, retrieved, finalText, usage, threadId };
}

function runCodexOnce({ prompt, model, effort, timeoutS, rawBase }) {
  return new Promise((resolve) => {
    let home; let cwd;
    try { home = makeCleanCodexHome(model, effort); cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-probe-cwd-')); }
    catch (e) { return resolve({ ok: false, failure: 'auth', error: e.message }); }
    const outFile = path.join(cwd, 'last.md');
    const args = ['exec', '--skip-git-repo-check', '--ephemeral', '-m', model, '-c', `model_reasoning_effort=${effort}`, '--sandbox', 'read-only', '-C', cwd, '--json', '-o', outFile, '-'];
    const t0 = Date.now();
    const child = spawn('codex', args, { env: { ...process.env, CODEX_HOME: home }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutS * 1000);
    child.on('error', (e) => { clearTimeout(timer); cleanup(); resolve({ ok: false, failure: e.code === 'ENOENT' ? 'no-codex' : 'other', error: e.message }); });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      fs.writeFileSync(`${rawBase}.events.jsonl`, out);
      const ev = parseCodexEvents(out);
      let last = ''; try { last = fs.readFileSync(outFile, 'utf8'); } catch { /* none */ }
      const text = (last || ev.finalText || '').trim();
      cleanup();
      const durationMs = Date.now() - t0;
      if (code === 0 && text) return resolve({ ok: true, durationMs, text, ev });
      const failure = signal === 'SIGKILL' ? 'timeout' : classifyFailure(`${err}\n${out.slice(-2000)}`);
      resolve({ ok: false, failure, error: `exit=${code} signal=${signal || ''} ${err.slice(-400)}`, durationMs, text, ev });
    });
    child.stdin.end(prompt);
    function cleanup() { for (const d of [home, cwd]) { try { if (d) fs.rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } } }
  });
}

// ───────────────────────── chatgpt-web 通道 ─────────────────────────

/**
 * 页内读取器：在 chatgpt.com 页面里跑（经 `opencli browser <会话> eval`），自包含、不引用外部变量（用 toString 注入）。
 * 只做两次只读 GET：/api/auth/session（取令牌，令牌只在这里用、不返回）与 /backend-api/conversation/<id>。
 * 页内每 3 秒轮询一次，最长 waitMs；到时返回 pending，由外层脚本决定是否再来一轮（外层有总硬超时）。
 * 完成判定只看会话数据（不看页面选择器）：沿 current_node 链，最后一条 assistant、content_type=text、recipient=all、
 * status=finished_successfully、end_turn=true（旧数据无 end_turn 时看 finish_details.type=stop）、正文非空。
 * 注意：工具调用前的中间 assistant 消息（recipient=web.run，正文为空）的 finish_details 也是 stop，所以不能只看它。
 * 返回 JSON 字符串：{state:'done'|'pending'|'error', ...}。
 */
export async function pageReader(id, waitMs) {
  const deadline = Date.now() + waitMs;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const out = (o) => JSON.stringify(o);
  if (location.hostname !== 'chatgpt.com') return out({ state: 'error', code: 'not-on-chatgpt', detail: String(location.href).slice(0, 120) });
  let token = '';
  try { const s = await (await fetch('/api/auth/session', { credentials: 'include' })).json(); token = (s && s.accessToken) || ''; }
  catch (e) { return out({ state: 'error', code: 'auth', detail: 'session fetch failed: ' + e.message }); }
  if (!token) return out({ state: 'error', code: 'auth', detail: 'no accessToken from /api/auth/session (chatgpt.com not logged in?)' });
  const norm = (u) => String(u || '').replace(/([?&])utm_source=chatgpt\.com&?/, '$1').replace(/[?&]$/, '');
  const textOf = (m) => ((m.content && m.content.parts) || []).filter((x) => typeof x === 'string').join('\n');
  let http = null; let last = null;
  for (;;) {
    let r = null;
    try { r = await fetch('/backend-api/conversation/' + id, { credentials: 'include', headers: { accept: 'application/json', authorization: 'Bearer ' + token } }); http = r.status; }
    catch (e) { http = 'fetch-error'; }
    if (r && (r.status === 401 || r.status === 403)) return out({ state: 'error', code: 'auth', detail: 'http ' + r.status });
    if (r && r.status === 429) return out({ state: 'error', code: 'rate-limit', detail: 'http 429' });
    if (r && r.ok) {
      const p = await r.json();
      const map = p.mapping || {};
      let chain = [];
      for (let cur = p.current_node; cur && map[cur]; cur = map[cur].parent) chain.push(map[cur].message);
      chain = chain.reverse().filter(Boolean);
      if (!chain.length) chain = Object.values(map).map((n) => n.message).filter(Boolean).sort((a, b) => (a.create_time || 0) - (b.create_time || 0));
      const isFinal = (m) => {
        if (!(m.author && m.author.role === 'assistant')) return false;
        if (m.recipient && m.recipient !== 'all') return false;
        if (!(m.content && m.content.content_type === 'text' && m.status === 'finished_successfully')) return false;
        const fd = (m.metadata && m.metadata.finish_details) || {};
        if (!(m.end_turn === true || (m.end_turn == null && fd.type === 'stop'))) return false;
        return !!textOf(m).trim();
      };
      const fin = chain.filter(isFinal).pop();
      const tail = chain[chain.length - 1];
      last = tail ? { role: tail.author && tail.author.role, ctype: tail.content && tail.content.content_type, status: tail.status } : null;
      if (fin) {
        const entries = []; const hits = []; const seenH = new Set(); const searchCalls = [];
        for (const m of chain) {
          let n = 0;
          for (const g of (m.metadata && m.metadata.search_result_groups) || []) {
            for (const e of g.entries || []) {
              n++; entries.push(e);
              const u = norm(e.url);
              if (u && !seenH.has(u)) { seenH.add(u); hits.push({ url: u, title: e.title || '', attribution: e.attribution || g.domain || '' }); }
            }
          }
          if (m.author && m.author.role === 'tool' && m.author.name === 'web.run' && n > 0) searchCalls.push(n);
        }
        const cited = []; const seenC = new Set();
        const addC = (u, title, attribution, via) => { u = norm(u); if (!u || seenC.has(u)) return; seenC.add(u); cited.push({ url: u, title: title || '', attribution: attribution || '', via }); };
        for (const c of (fin.metadata && fin.metadata.content_references) || []) {
          // 行内标记形如 <U+E200>cite<U+E202>turn123search10<U+E202>...<U+E201>：按 (类型, 序号) 回查检索命中
          for (const m of String(c.matched_text || '').matchAll(/turn\d+([a-z]+)(\d+)/g)) {
            const e = entries.find((x) => x.ref_id && x.ref_id.ref_type === m[1] && String(x.ref_id.ref_index) === m[2]);
            if (e) addC(e.url, e.title, e.attribution, 'marker');
          }
          for (const it of [].concat(c.items || [], c.sources || [])) if (it && it.url) addC(it.url, it.title, it.attribution, 'item');
          for (const u of c.safe_urls || []) addC(u, '', '', 'safe_url');
        }
        const md = fin.metadata || {};
        return out({ state: 'done', http, model: md.resolved_model_slug || md.model_slug || p.default_model_slug || null, memory_scope: p.memory_scope ?? null, is_temporary_chat: p.is_temporary_chat ?? null, title: p.title || null, text: textOf(fin), cited, hits, searchCalls });
      }
    }
    if (Date.now() + 3000 > deadline) return out({ state: 'pending', http, last });
    await sleep(3000);
  }
}
export const readerJs = (id, waitMs) => `(${pageReader.toString()})(${JSON.stringify(id)}, ${Math.floor(waitMs)})`;

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function convIdFrom(text) {
  const t = String(text || '');
  try { const v = JSON.parse(t); const o = Array.isArray(v) ? v[0] : v; if (o?.conversationId && /^[0-9a-f-]{20,}$/i.test(o.conversationId)) return o.conversationId; } catch { /* fall through */ }
  const m = t.match(/"?conversationId"?\s*[:=]\s*"?([0-9a-f-]{20,})/i) || t.match(/\/c\/([0-9a-f-]{20,})/i);
  return m ? m[1] : null;
}

/** 发送：只借 `opencli chatgpt ask --new --wait false`（不传 --web-search），拿 conversationId。最多 2 次，认证类错误不重试。 */
async function sendChatgptPrompt(prompt, web) {
  let lastErr = ''; let failure = 'send-failed';
  for (let attempt = 1; attempt <= 2; attempt++) {
    lockChatgpt();
    await reserveConversation();
    checkSessionHealth(web);
    await checkExit(web);
    const r = oc(['chatgpt', 'ask', prompt, '--new', '--wait', 'false', '-f', 'json', '--site-session', 'persistent', '--window', 'isolated'], { timeoutS: 150 });
    if (r.spawnError === 'ENOENT') return { ok: false, failure: 'no-opencli', error: 'PATH 里找不到 opencli' };
    const conv = convIdFrom(r.stdout) || convIdFrom(r.stderr);
    if (r.status === 0 && conv) return { ok: true, conv };
    lastErr = (r.stderr || r.stdout || r.spawnError || '').trim().slice(-300);
    failure = classifyWebSend(lastErr);
    if (failure === 'auth' || failure === 'rate-limit') break;
    if (attempt < 2) await sleep(15000);
  }
  return { ok: false, failure, error: `opencli chatgpt ask 发送失败（exit≠0 或没拿到 conversationId）：${lastErr}` };
}

/**
 * 发送 → 页内轮询会话数据 → 取回答与引用。总硬超时 timeoutS（从发送成功起算），不重发、不无限重试。
 * web = { session, ready, opened }：读数据用的 opencli browser 会话（描述性名字）、「已在 chatgpt.com」标记、是否开过（收尾要 close），跨提问复用。
 */
async function runMultiTurnChat({ prompts, timeoutS, web }) {
  const t0 = Date.now();
  const turns = [];
  let first = null; let last = null;
  try {
    for (const [i, prompt] of prompts.entries()) {
      if (i) await sleep(randomMs(10, 25));
      last = await runTemporaryChat({ prompt, timeoutS, web, continuation: i > 0, natural: true });
      first ||= last;
      turns.push({ n: i + 1, prompt, answer: last.text || '',
        citedDomains: uniq((last.cited || []).map(c => c.domain)),
        textDomains: extractReco({ answer: last.text || '' }).linkDomains,
        cited: last.cited || [], durationMs: last.durationMs || 0, ok: last.ok,
        searched: !!last.searched, ...(last.ok ? {} : { failure: last.failure, error: last.error, pageText: last.pageText, pageUrl: last.pageUrl }) });
      if (!last.ok) break;
    }
    return { ...first, ok: last.ok, failure: last.failure, error: last.error, ...(!last.ok ? { pageText: last.pageText, pageUrl: last.pageUrl } : {}), turns, durationMs: Date.now() - t0 };
  } finally {
    if (web.opened && !web.keepOpen) closeSession(web);
  }
}

async function runChatgptWebOnce({ prompt, timeoutS, web }) {
  if (web.temporary) return runTemporaryChat({ prompt, timeoutS, web });
  const t0 = Date.now();
  lockChatgpt();
  if (!web.opened) {
    const opened = browserCommand(web, ['open', 'https://chatgpt.com/'], { timeoutS: 90 });
    web.opened = opened.status === 0;
    if (!web.opened) return { ok: false, failure: 'page', error: '无法打开 ChatGPT 登录检查页' };
  }
  let sent;
  try { sent = await sendChatgptPrompt(prompt, web); }
  catch (error) { return { ok: false, failure: 'session-health', error: error.message }; }
  if (!sent.ok) return { ok: false, failure: sent.failure, error: sent.error, durationMs: Date.now() - t0 };
  const conv = sent.conv;
  const conversationUrl = `https://chatgpt.com/c/${conv}`;
  const fail = (failure, error, extra = {}) => ({ ...(['session-health', 'captcha', 'rate-limit', 'auth', 'page', 'timeout'].includes(failure) ? failedPage(web) : {}), ok: false, failure, error, conversationId: conv, durationMs: Date.now() - t0, ...extra });
  const pollDeadline = Date.now() + timeoutS * 1000;
  let got = null; let last = null; let fails = 0; let reopens = 0; let lastErr = '';
  while (Date.now() < pollDeadline) {
    if (!web.ready) {
      const o = browserCommand(web, ['open', 'https://chatgpt.com/'], { timeoutS: 90 });
      if (o.status !== 0) { lastErr = (o.stderr || o.stdout || o.spawnError || '').trim().slice(-200); if (++fails >= 3) return fail('page', `opencli browser ${web.session} open chatgpt.com 连续失败：${lastErr}`); await sleep(3000); continue; }
      web.ready = true; web.opened = true; fails = 0;
    }
    const chunkMs = Math.max(3000, Math.min(40000, pollDeadline - Date.now()));
    const r = oc(['browser', web.session, 'eval', readerJs(conv, chunkMs), '--window', 'dedicated'], { timeoutS: Math.ceil(chunkMs / 1000) + 40 });
    if (r.spawnError === 'ENOENT') return fail('no-opencli', 'PATH 里找不到 opencli');
    const j = parseEvalJson(r.stdout);
    if (!j) { lastErr = (r.stderr || r.stdout || r.spawnError || '').trim().slice(-200); web.ready = false; if (++fails >= 3) return fail('eval-failed', `opencli browser eval 连续 3 次没有可解析输出：${lastErr}`); await sleep(3000); continue; }
    fails = 0;
    if (j.state === 'done') { got = j; break; }
    if (j.state === 'pending') { last = j; continue; }
    if (j.code === 'not-on-chatgpt' && ++reopens <= 2) { web.ready = false; continue; }
    return fail(j.code === 'auth' ? 'auth' : j.code === 'rate-limit' ? 'rate-limit' : 'page', `页内读取失败（${j.code}）：${j.detail || ''}`);
  }
  if (!got) return fail('timeout', `会话 ${conv} 在 ${timeoutS} 秒内没有出现「已完成」的最终回答（最后一条消息：${last?.last ? `${last.last.role}/${last.last.ctype}/${last.last.status}` : '未知'}；最后 HTTP ${last?.http ?? '未知'}${last ? '' : `；读取会话数据一直没有可解析输出：${lastErr || '无输出'}`}）。回答可能仍在生成，可手动打开 ${conversationUrl} 查看；脚本不重发。`);
  const retrieved = (got.hits || []).map((h) => ({ domain: regDomain(h.url), url: h.url, title: h.title || '' }));
  const cited = (got.cited || []).map((c) => ({ domain: regDomain(c.url), url: c.url, title: c.title || c.attribution || '', via: c.via }));
  // 只有 web.run 工具消息带命中才算一次真实检索（「Reply exactly: ok」这类也会带一条空的 web.run 消息）；payload 不含搜索词
  const searches = (got.searchCalls || []).map((n) => ({ queries: [], preSited: false, resultCount: n }));
  if (!searches.length && (retrieved.length || cited.length)) searches.push({ queries: [], preSited: false, resultCount: retrieved.length });
  return {
    ok: true, durationMs: Date.now() - t0, text: got.text, conversationId: conv, cited,
    web: { memory_scope: got.memory_scope, is_temporary_chat: got.is_temporary_chat, model: got.model, title: got.title, conversationUrl, consultedCount: retrieved.length, citedCount: cited.length },
    ev: { searches, retrieved, usage: null },
  };
}

/** codex 通道没有结构化引用，只能取答案正文里出现的链接当「引用来源」（与网页通道的 content_references 口径不同，via 字段区分） */
export function answerLinkSources(answer) {
  return uniq(urlsIn(answer)).map((u) => ({ domain: regDomain(u), url: u, title: '', via: 'answer-link' }));
}

// ───────────────────────── 网页通道的记忆污染标记 ─────────────────────────

export const MEMORY_UNCONFIRMED = '未确认无记忆污染，仅供参考';
/** 给输出顶部用的提示；null = 不需要提示。scopesSeen 是各会话 payload 里读到的 memory_scope。 */
export function memoryBanner(memoryClean, scopesSeen = []) {
  const on = uniq(scopesSeen).includes('global_enabled');
  if (memoryClean === 'user-confirmed') return on ? '你传了 --memory-clean，但会话 payload 显示 memory_scope=global_enabled（账号记忆是开着的），与声明矛盾：结果仍可能被账号记忆污染，仅供参考' : null;
  if (memoryClean === 'unknown') return MEMORY_UNCONFIRMED + (on ? '（会话 payload 显示 memory_scope=global_enabled：账号记忆确实开着）' : '');
  return null;
}

// ───────────────────────── Google 前 10 ─────────────────────────

function loadSerp(args, outDir, log) {
  let items = null;
  if (args['google-serp-file']) items = JSON.parse(fs.readFileSync(args['google-serp-file'], 'utf8'));
  else if (args['google-top']) items = String(args['google-top']).split(',').map((s) => s.trim()).filter(Boolean).map((d) => ({ url: `https://${d}/`, title: '' }));
  else if (args['fetch-google']) {
    const r = oc(['google', 'search', args.topic, '--limit', '10', '-f', 'json', '--window', 'isolated', '--site-session', 'persistent'], { timeoutS: 120 });
    try { items = JSON.parse(r.stdout); } catch { log(`Google SERP 抓取失败：${(r.stderr || r.stdout).slice(-200)}`); }
  }
  if (!items) return [];
  const top = [];
  for (const it of items) {
    const d = regDomain(it.url);
    // google.com 是 SERP 自带模块（图片/问答等）的链接，不是自然结果；同域名只留最靠前的一条
    if (d && d !== 'google.com' && !top.some((t) => t.domain === d)) top.push({ domain: d, title: it.title || '', url: it.url });
  }
  fs.writeFileSync(path.join(outDir, 'google-serp.json'), JSON.stringify(items, null, 2));
  return top;
}

// ───────────────────────── 汇总指标 ─────────────────────────

const jaccard = (a, b) => { const A = new Set(a), B = new Set(b); const u = new Set([...A, ...B]); if (!u.size) return 1; let i = 0; for (const x of A) if (B.has(x)) i++; return i / u.size; };
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const round = (x, n = 2) => (x === null || x === undefined ? null : Math.round(x * 10 ** n) / 10 ** n);

const compact = (x) => String(x || '').toLowerCase().replace(/[^a-z0-9]/g, '');
/** 首轮搜索词里是否已经带有最终推荐的产品名/域名主标签——带了 = 先凭记忆选人、再联网核实，而不是靠搜索发现 */
export function firstQueryNamesPick(r) {
  const q = compact((r.searches?.[0]?.queries || []).join(' '));
  if (!q) return null;
  return r.reco.list.some((x) => { const lab = compact(x.domain.split('.')[0]); const nm = compact(x.name); return (lab.length >= 4 && q.includes(lab)) || (nm.length >= 4 && q.includes(nm)); });
}

export function summarizeGroup(records, googleDomains, topicTokens) {
  const ok = records.filter((r) => r.ok);
  const sets = ok.map((r) => r.reco.list.map((x) => x.domain));
  const top1 = ok.map((r) => r.reco.list[0]?.domain || null);
  const freq = new Map();
  for (const s of sets) for (const d of new Set(s)) freq.set(d, (freq.get(d) || 0) + 1);
  const union = [...freq.keys()];
  const modal = (() => { const c = new Map(); for (const t of top1) if (t) c.set(t, (c.get(t) || 0) + 1); return [...c.entries()].sort((a, b) => b[1] - a[1])[0] || null; })();
  const pairs = []; for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) pairs.push(jaccard(sets[i], sets[j]));
  const g = new Set(googleDomains.map(canon));
  const recoInGoogle = union.filter((d) => g.has(d));
  const retrievedUnion = uniq(ok.flatMap((r) => (r.retrieved || []).map((x) => canon(x.domain))));
  // 引用来源（cited）：网页通道=最终答案的 content_references；codex 通道=答案正文里的链接。与「检索命中」是两回事
  const citedFreq = new Map();
  for (const r of ok) for (const d of new Set((r.cited || []).map((c) => canon(c.domain)).filter(Boolean))) citedFreq.set(d, (citedFreq.get(d) || 0) + 1);
  const citedUnion = [...citedFreq.keys()];
  const kinds = {}; for (const r of ok) for (const x of r.reco.list) if (x.kind) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
  // 「博客榜单占比」只算推荐名单之外的域名：被推荐产品自己站上的 /blog/ 页面不是第三方榜单
  const citedUrls = uniq(ok.flatMap((r) => [...(r.retrieved || []).map((x) => x.url), ...urlsIn(r.answer)])).filter((u) => !freq.has(canon(regDomain(u))));
  const listicleShare = citedUrls.length ? citedUrls.filter(looksLikeListicle).length / citedUrls.length : null;
  const top1Modal = modal ? modal[0] : null;
  const topicMatch = top1Modal ? topicTokens.filter((t) => top1Modal.split('.')[0].includes(t)).length : 0;
  return {
    n: records.length, nOk: ok.length,
    searchedShare: round(mean(ok.map((r) => (r.searched ? 1 : 0)))),
    citedShare: round(mean(ok.map((r) => ((r.cited || []).length ? 1 : 0)))),
    citedDomainFrequency: Object.fromEntries([...citedFreq.entries()].sort((x, y) => y[1] - x[1])),
    preSitedShare: round(mean(ok.map((r) => (r.searches?.length && r.searches.every((s) => s.preSited) ? 1 : 0)))),
    firstQueryNamesPickShare: round(mean(ok.map(firstQueryNamesPick).filter((x) => x !== null).map((x) => (x ? 1 : 0)))),
    avgDurationS: round(mean(ok.map((r) => r.durationMs / 1000)), 1),
    perDomainFrequency: Object.fromEntries([...freq.entries()].sort((a, b) => b[1] - a[1])),
    coreAllRuns: union.filter((d) => freq.get(d) === ok.length),
    stableShare_ge2: union.length ? round(union.filter((d) => freq.get(d) >= 2).length / union.length) : null,
    pairwiseJaccard: round(mean(pairs)),
    top1PerRun: top1,
    top1Consistency: top1.length && modal ? round(modal[1] / top1.length) : null,
    top1Modal,
    googleOverlap: { recoUnionInGoogleTop10: recoInGoogle, count: recoInGoogle.length, top1InGoogleTop10: top1Modal ? g.has(top1Modal) : null, retrievedInGoogleTop10: retrievedUnion.filter((d) => g.has(d)), citedInGoogleTop10: citedUnion.filter((d) => g.has(d)) },
    kindsCount: kinds,
    listicleShareOfUrls: round(listicleShare),
    slotHint: slotHint({ top1Modal, consistency: modal ? modal[1] / (top1.length || 1) : 0, kinds, listicleShare, topicMatch }),
  };
}

function slotHint({ top1Modal, consistency, kinds, listicleShare, topicMatch }) {
  return `历史 slotHint 字段（不参与裁决）：Top1 众数 ${top1Modal || '无'}；一致率 ${(consistency * 100).toFixed(0)}%；类型计数 ${JSON.stringify(kinds)}；博客榜单 URL 占比 ${listicleShare ?? '未知'}；域名词素匹配数 ${topicMatch}`;
}

// 只使用已有推荐/文本域名解析；引用和检索命中本身不等于点名。
function firstResponseNamesExternalProduct(r) {
  const first = r.turns?.[0];
  if (!(first ? first.ok : r.ok)) return null;
  const reco = first ? extractReco({ answer: first.answer }) : (r.reco || extractReco(r));
  const ext = (d) => d && !['chatgpt.com', 'openai.com'].includes(regDomain(d));
  if (uniq([...reco.list.map(x => x.domain), ...reco.linkDomains, ...(first?.textDomains || [])]).some(ext)) return true;
  if (reco.list.some(x => x.name && !/^(chatgpt|openai)$/i.test(String(x.name).trim()))) return true;
  // 没解析到域名或名称，不能据此断言「没有点名」：纯文本里的产品名在不调用模型时无法识别。
  // 只有后续追问里 ChatGPT 自己记录的推荐清单（{"recommendations":[...]}）明确为空，才记「否」（自报，口径单列）；其余记「未知」。
  for (const t of (r.turns || []).slice(1)) {
    const m = String(t?.answer || '').match(/\{[^{}]*"recommendations"\s*:\s*\[\s*\][^{}]*\}/);
    if (m) return false;
  }
  return null;
}

function summarizeQuestions(results) {
  const groups = new Map();
  for (const r of results) {
    const prompt = r.turns?.[0]?.prompt || r.prompt;
    const key = JSON.stringify([r.channel, !!r.turns, prompt]);
    if (!groups.has(key)) groups.set(key, { prompt, channel: r.channel, sampleMode: r.turns ? 'multi-turn-natural' : 'historical-wrapped', samples: [] });
    groups.get(key).samples.push({ label: r.label, firstResponseNamesExternalProduct: firstResponseNamesExternalProduct(r) });
  }
  return [...groups.values()].map(g => {
    const known = g.samples.filter(r => r.firstResponseNamesExternalProduct !== null);
    const k = known.filter(r => r.firstResponseNamesExternalProduct).length;
    const n = known.length;
    const z2 = 1.96 ** 2;
    const center = n ? (k / n + z2 / (2 * n)) / (1 + z2 / n) : null;
    const half = n ? 1.96 * Math.sqrt(k / n * (1 - k / n) / n + z2 / (4 * n ** 2)) / (1 + z2 / n) : null;
    return { ...g, namedCount: k, nKnown: n, nUnknown: g.samples.length - n,
      namingRate: n ? round(k / n, 4) : null, namingRateWilson95: n ? [round(center - half, 4), round(center + half, 4)] : null };
  });
}

// ───────────────────────── 主流程 ─────────────────────────

const HELP = 'ai-probe.mjs --topic <词> --need-prompt <文本> --out <目录> [--keyword-prompt <文本>] [--reps 3] [--google-top a.com,b.com | --google-serp-file f | --fetch-google] [--channel codex|chatgpt-web [--temporary] [--memory-clean]] [--kinds N,K,C] [--followup-prompt <文本>] [--multi-turn [--turns <整数>] [--turn2-prompt <文本>] [--turn3-prompt <文本>] [--followup <文本> ...]] [--keep-open] [--dry-run] [--resume] [--summarize-only]（详见文件头注释）\n新流程自然采样以 ChatGPT 网页版为准：--channel chatgpt-web --memory-clean --multi-turn；默认通道仍为 codex。Codex 通道与旧 N/K 包装样本仅作历史兼容，不冒充自然样本。';

async function main() {
  const args = parseArgs();
  if (args.help || args.h) { console.log(HELP); return 0; }
  for (const k of ['topic', 'out']) if (!args[k] || args[k] === true) { console.error(`缺少 --${k}\n${HELP}`); return 2; }
  const channel = args.channel || 'codex';
  if (!['codex', 'chatgpt-web'].includes(channel)) { console.error('--channel 只能是 codex 或 chatgpt-web'); return 2; }
  const webChannel = channel === 'chatgpt-web';
  const multiTurn = !!args['multi-turn'];
  if (multiTurn && !webChannel) { console.error('--multi-turn 仅网页通道 chatgpt-web 支持'); return 2; }
  const turnCount = Number(args.turns || 3);
  if (multiTurn && (!Number.isInteger(turnCount) || turnCount < 1)) { console.error('--turns 必须是 1 及以上整数'); return 2; }
  if ((!args.kinds || String(args.kinds).split(',').includes('N')) && (!args['need-prompt'] || args['need-prompt'] === true)) { console.error(`缺少 --need-prompt\n${HELP}`); return 2; }
  const customFollowups = args.followup && args.followup !== true ? [].concat(args.followup).map(String) : [];
  const defaults = [String(args['turn2-prompt'] || 'Why did you recommend that one first, and what are its weak points?'), String(args['turn3-prompt'] || "Is there anything better out there that you'd recommend instead? What would a better product need to do?")];
  const followupPrompts = Array.from({ length: turnCount - 1 }, (_, i) => customFollowups[i] ?? defaults[i % 2]);
  const memoryFlag = args['memory-clean'] !== undefined && args['memory-clean'] !== false && args['memory-clean'] !== 'false';
  // 网页通道：默认 unknown；只有用户明确传 --memory-clean 才记 user-confirmed。codex 通道用空 CODEX_HOME，不存在账号记忆问题
  const memoryClean = webChannel ? (memoryFlag ? 'user-confirmed' : 'unknown') : 'n/a-isolated-codex-home';
  setAliases(args.alias);
  const topic = String(args.topic);
  const keyword = String(args.keyword || topic);
  const reps = Number(args.reps || 3);
  const keepOpen = !!args['keep-open'];
  if (keepOpen && (!webChannel || reps > 1)) { console.error('--keep-open 仅 chatgpt-web 且 --reps 1 支持'); return 2; }
  const model = String(args.model || 'gpt-6-sol');
  const effort = String(args.effort || 'low');
  const timeoutS = Number(args['timeout-s'] || (webChannel ? 150 : 300));
  const concurrency = webChannel ? 1 : Math.max(1, Number(args.concurrency || 3));
  const gapMs = Number(args['gap-ms'] ?? (webChannel ? 30000 : 2000));
  const outDir = path.resolve(String(args.out));
  const rawDir = path.join(outDir, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  const logLines = [];
  const log = (m) => { const l = `[${new Date().toISOString().slice(11, 19)}] ${m}`; logLines.push(l); console.error(l); };

  if (webChannel) {
    log('[提示] 临时路径核对页面不使用记忆声明，未做 payload 核验；旧普通对话路径仍可能读取账号记忆。');
    log(memoryFlag
      ? '[警告] 已传 --memory-clean：临时路径仍须通过 URL 与页面临时声明/横幅闸门，不代表关闭账号记忆；旧普通路径按干净账号声明并检查 payload 矛盾。'
      : `[警告] 未传 --memory-clean：所有输出与摘要顶部会标「${MEMORY_UNCONFIRMED}」。要做正式采样，请用未开记忆的干净账号，用户确认后再传 --memory-clean。本脚本不会改账号设置，也不会去点「不个性化」。`);
    if (args['web-search']) log('[提示] --web-search 已弃用并被忽略：opencli 的开关在新版 chatgpt.com 上必失败；网页通道改为在提示词末尾写 “Use web search.”。');
  } else if (memoryFlag) log('[提示] --memory-clean 只对 chatgpt-web 通道有意义（codex 通道用空 CODEX_HOME，没有账号记忆），已忽略。');

  const top = loadSerp({ ...args, topic }, outDir, log);
  const googleDomains = top.map((t) => t.domain);
  log(`Google 前 10（${top.length}）：${googleDomains.join(', ') || '（无）'}`);

  const kPrompt = args['keyword-prompt'] && args['keyword-prompt'] !== true ? String(args['keyword-prompt']) : `I'm looking for the best "${keyword}". Recommend specific options and tell me which one you'd pick first.`;
  const jobs = [];
  for (let i = 1; i <= reps; i++) jobs.push({ kind: 'N', rep: i, body: String(args['need-prompt']) });
  for (let i = 1; i <= reps; i++) jobs.push({ kind: 'K', rep: i, body: kPrompt });
  if (!multiTurn && args.followup !== false && args['no-followup'] !== true) {
    if (top.length >= 1) jobs.push({ kind: 'C', rep: 1, body: followupBody(keyword, top) });
    else log('没有 Google 前 10，跳过 C 型追问（传 --google-top / --google-serp-file / --fetch-google）');
  }
  if (!multiTurn && args['followup-prompt']) { const c = jobs.find(j => j.kind === 'C'); if (c) c.body = String(args['followup-prompt']); else jobs.push({kind:'C',rep:1,body:String(args['followup-prompt'])}); }
  if (args.kinds) { const selected = String(args.kinds).split(','); for (let i=jobs.length-1;i>=0;i--) if (!selected.includes(jobs[i].kind)) jobs.splice(i,1); }
  for (const j of jobs) { j.prompt = multiTurn ? j.body : wrap(j.kind, j.body, channel); if (multiTurn) j.prompts = [j.prompt, ...followupPrompts]; j.label = `${j.kind}-${j.rep}`; }

  if (args.resume) {
    for (const job of jobs) {
      const jsonPath = path.join(rawDir, `${job.label}.json`);
      if (!fs.existsSync(jsonPath)) continue;
      let prev;
      try { prev = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); } catch { continue; }
      const expected = { topic, prompt: job.prompt, channel, model: webChannel ? prev.web?.model : model, effort: webChannel ? null : effort };
      const mismatches = Object.keys(expected).filter((key) => prev[key] !== expected[key]);
      if (mismatches.length) throw new Error(`${job.label} 续跑参数不一致（${mismatches.join(', ')}）；请换 --out 或去掉 --resume`);
    }
  }

  if (args['dry-run']) { console.log(`channel=${channel} memoryClean=${memoryClean}${webChannel && !memoryFlag ? `（${MEMORY_UNCONFIRMED}）` : ''} timeout=${timeoutS}s`); for (const j of jobs) for (const [i, prompt] of (j.prompts || [j.prompt]).entries()) console.log(`\n===== ${j.label}${multiTurn ? ` turn ${i + 1}` : ''} =====\n${prompt}`); return 0; }

  const results = [];
  const queue = args['summarize-only'] ? [] : [...jobs];
  if (args['summarize-only']) {
    // 只重算汇总：读 raw/*.json，不发任何提问
    for (const f of fs.existsSync(rawDir) ? fs.readdirSync(rawDir) : []) if (f.endsWith('.json')) { try { const r = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8')); r.answer = cleanText(r.answer); r.reco = extractReco(r); r.firstResponseNamesExternalProduct = firstResponseNamesExternalProduct(r); results.push(r); } catch { /* skip */ } }
    log(`--summarize-only：读到 ${results.length} 条记录`);
  }
  let lastStart = 0; let abortAll = null;
  // 读会话数据用的 opencli browser 会话：描述性名字（不用 $$/随机串，方便一眼认出、也避免同名并发——同名会话别给两个任务用）
  const webState = webChannel ? { session: String(args['web-session'] || 'ai-probe-web'), ready: false, opened: false, keepOpen, keepAlive: keepOpen || multiTurn, temporary: multiTurn || (args['no-temporary'] !== true && args.temporary !== false) } : null;

  if (webState && !args['dry-run'] && !args['summarize-only']) { lockChatgpt(); manageSession(webState); }

  async function worker() {
    while (queue.length && !abortAll) {
      const job = queue.shift();
      const rawBase = path.join(rawDir, job.label);
      const jsonPath = `${rawBase}.json`;
      if (args.resume && fs.existsSync(jsonPath)) { try { const prev = JSON.parse(fs.readFileSync(jsonPath, 'utf8')); if (prev.ok) { results.push(prev); log(`${job.label} 已有结果，跳过`); continue; } } catch { /* rerun */ } }
      const wait = webChannel && lastStart && args['gap-ms'] == null ? randomMs(30, 90) : Math.max(0, lastStart + gapMs - Date.now()); lastStart = Date.now() + wait; if (wait) await sleep(wait);
      log(`${job.label} 发送（${channel}）`);
      let res = null;
      // 网页通道不在这一层重试：发送失败已在 sendChatgptPrompt 内重试过一次；超时（会话已存在）再发只会往用户的 ChatGPT 历史里多塞一条
      const maxAttempts = webChannel ? 1 : 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        res = channel === 'codex'
          ? await runCodexOnce({ prompt: job.prompt, model, effort, timeoutS, rawBase })
          : multiTurn ? await runMultiTurnChat({ prompts: job.prompts, timeoutS, web: webState })
          : await runChatgptWebOnce({ prompt: job.prompt, timeoutS, web: webState });
        if (res.ok) break;
        const fatal = ['quota-402', 'auth', 'model', 'no-codex', 'no-opencli'].includes(res.failure); // 这些重试没用，交回人
        log(`${job.label} 失败（${res.failure}），${fatal || attempt >= maxAttempts ? '不再重试' : '30 秒后重试一次'}${res.error ? `：${String(res.error).slice(0, 400)}` : ''}`);
        if (fatal) break;
        if (attempt < maxAttempts) await sleep(30000);
      }
      const { answer, probe, probeError } = multiTurn ? { answer: res.text || '', probe: null, probeError: null } : res.ok ? splitProbe(res.text) : { answer: res.text || '', probe: null, probeError: res.error || null };
      const ev = res.ev || { searches: [], retrieved: [], usage: null };
      const rec = {
        label: job.label, kind: job.kind, rep: job.rep, channel, topic, ok: !!res.ok, failure: res.ok ? null : res.failure, error: res.ok ? null : res.error,
        ...(!res.ok && res.pageText !== undefined ? { pageText: res.pageText, pageUrl: res.pageUrl } : {}),
        prompt: job.prompt, startedAt: new Date(lastStart).toISOString(), durationMs: res.durationMs || null, model: channel === 'codex' ? model : res.web?.model, effort: channel === 'codex' ? effort : null,
        memoryClean,
        searched: multiTurn ? !!res.searched : ev.searches.length > 0, searches: ev.searches, retrieved: ev.retrieved, usage: ev.usage, web: res.web || null, conversationId: res.conversationId || null,
        answer, probe, probeError, ...(multiTurn ? { turns: res.turns } : {}),
      };
      // 引用来源：网页通道=最终答案的 content_references（via=marker|item|safe_url）；codex=答案正文里的链接（via=answer-link）
      rec.cited = (res.ok || rec.turns?.[0]?.ok) ? (webChannel ? (res.cited || []) : answerLinkSources(answer)) : [];
      rec.memoryScopeConflict = !!(webChannel && memoryFlag && rec.web?.memory_scope === 'global_enabled');
      if (rec.memoryScopeConflict) log(`[警告] ${job.label}：你传了 --memory-clean，但会话 payload 显示 memory_scope=global_enabled（账号记忆是开着的）——声明与页面矛盾，这批结果仍可能被账号记忆污染。`);
      rec.reco = extractReco(rec);
      rec.firstResponseNamesExternalProduct = firstResponseNamesExternalProduct(rec);
      rec.textDomains = rec.reco.linkDomains;
      fs.writeFileSync(jsonPath, JSON.stringify(rec, null, 2));
      fs.writeFileSync(`${rawBase}.answer.md`, `${answer}\n`);
      results.push(rec);
      log(`${job.label} ${rec.ok ? 'ok' : 'FAIL'} ${rec.durationMs ? (rec.durationMs / 1000).toFixed(0) + 's' : ''} 联网=${rec.searched} 检索命中=${rec.retrieved.length} 引用=${rec.cited.length} 名单=${rec.reco.list.map((x) => x.domain).join(',') || '（空）'}${rec.conversationId ? ` 会话=${rec.conversationId}` : ''}`);
      if (!rec.ok && ['quota-402', 'auth', 'model', 'no-codex', 'no-opencli', 'rate-limit', 'privacy-switch', 'session-health', 'captcha'].includes(rec.failure)) { abortAll = rec.failure; log(`遇到 ${rec.failure}：停止后续提问，交回人处理（不硬试）`); }
    }
  }
  try {
    await Promise.all(Array.from({ length: concurrency }, () => worker()));
  } finally {
    if (webState?.opened && (!keepOpen || abortAll || results.some(r => !r.ok))) closeSession(webState);
  }

  // 汇总
  const by = (k) => results.filter((r) => r.kind === k).sort((a, b) => a.rep - b.rep);
  const tokens = keyword.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !['best', 'free', 'online'].includes(t));
  // 通道与记忆标记：summarize-only 时以 raw 记录为准（「用户已确认」只在采集当时有意义，不接受事后从命令行补传）
  const channels = uniq(results.map((r) => r.channel));
  const summaryChannel = args['summarize-only'] ? (channels.length === 1 ? channels[0] : channels.length ? 'mixed' : channel) : channel;
  const webRecs = results.filter((r) => r.channel === 'chatgpt-web');
  const summaryMemoryClean = !webRecs.length ? 'n/a-isolated-codex-home' : webRecs.every((r) => r.memoryClean === 'user-confirmed') ? 'user-confirmed' : 'unknown';
  const memoryScopesSeen = uniq(webRecs.map((r) => r.web?.memory_scope));
  const summary = {
    banner: webRecs.length ? memoryBanner(summaryMemoryClean, memoryScopesSeen) : null,
    memoryClean: summaryMemoryClean, memoryScopesSeen,
    topic, keyword, channel: summaryChannel, model: summaryChannel === 'codex' ? model : null, effort: summaryChannel === 'codex' ? effort : null, generatedAt: new Date().toISOString(),
    aliases: ALIASES,
    questions: summarizeQuestions(results),
    caveat: 'n 很小，只是一次探针，不是统计结论；' + (multiTurn || results.some(r => r.turns) ? '多轮自然提问不带探针尾巴；域名只按引用/文本链接计数，不等于确认推荐；' : '探针尾巴会让模型多讲弱点；') + 'codex 通道≠网页版 ChatGPT；网页通道拿不到搜索词（firstQueryNamesPickShare 恒为 null）。',
    google: { top10: googleDomains, source: args['google-serp-file'] ? 'file' : args['google-top'] ? 'arg' : args['fetch-google'] ? 'opencli-google' : 'none' },
    N: summarizeGroup(by('N'), googleDomains, tokens),
    K: summarizeGroup(by('K'), googleDomains, tokens),
    C: by('C').map((r) => ({ ok: r.ok, searched: r.searched, verdicts: r.probe?.verdicts || null, firstPick: r.probe?.my_first_pick || null, newProductWinsIf: r.probe?.new_product_wins_if || null, marketGap: r.probe?.market_gap || null })),
    marketGaps: uniq(results.map((r) => r.probe?.market_gap).filter(Boolean)),
    failures: results.filter((r) => !r.ok).map((r) => ({ label: r.label, failure: r.failure, error: r.error, ...(r.pageText !== undefined ? { pageText: r.pageText.slice(0, 120), pageUrl: r.pageUrl } : {}), conversationId: r.conversationId || null })),
    aborted: abortAll,
  };
  fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(outDir, 'summary.md'), renderMd(summary, results));
  if (!args['summarize-only']) fs.writeFileSync(path.join(outDir, 'run.log'), logLines.join('\n') + '\n');
  log(`汇总：${path.join(outDir, 'summary.md')}`);
  if (webState?.opened && keepOpen && !summary.failures.length && !abortAll) {
    webState.retained = true;
    console.log(`会话保持打开：${webState.session}；用 opencli browser ${webState.session} close 关闭`);
  }
  return summary.failures.length || abortAll ? 3 : 0;
}

function renderMd(s, results) {
  const L = [];
  if (s.banner) L.push(`> **${s.banner}**`, '');
  L.push(`# AI 探针：${s.topic}`, '', `- 通道：${s.channel}${s.model ? `（${s.model} ${s.effort}）` : ''}；memoryClean=${s.memoryClean}${s.memoryScopesSeen?.length ? `；payload memory_scope=${s.memoryScopesSeen.join('/')}` : ''}；生成：${s.generatedAt}`, `- ${s.caveat}`, `- Google 前 10（${s.google.source}）：${s.google.top10.join(', ') || '（无）'}`, ...(Object.keys(s.aliases || {}).length ? [`- 域名别名（折成同一产品）：${JSON.stringify(s.aliases)}`] : []), '');
  for (const k of ['N', 'K']) {
    const g = s[k];
    L.push(`## ${k} 型（${k === 'N' ? '需求描述，不含关键词' : '关键词直问'}）`, '', `- 成功 ${g.nOk}/${g.n}；联网占比 ${g.searchedShare}；首轮搜索词里已带最终推荐产品名的占比 ${g.firstQueryNamesPickShare}（仅记录词面包含，不推断因果）；全部搜索都是 site: 限定的占比 ${g.preSitedShare}；平均 ${g.avgDurationS}s`,
      `- 每个域名出现次数：${Object.entries(g.perDomainFrequency).map(([d, c]) => `${d}×${c}`).join('、') || '（无）'}`,
      `- 每次都出现的域名：${g.coreAllRuns.join('、') || '（无）'}；≥2 次占并集：${g.stableShare_ge2}；两两 Jaccard 均值：${g.pairwiseJaccard}`,
      `- Top1 每次：${g.top1PerRun.join(' / ')}；一致率 ${g.top1Consistency}（众数 ${g.top1Modal || '无'}）`,
      `- 与 Google 前 10 重合：推荐并集里 ${g.googleOverlap.count} 个（${g.googleOverlap.recoUnionInGoogleTop10.join('、') || '无'}）；Top1 在前 10：${g.googleOverlap.top1InGoogleTop10}；检索命中里在前 10 的：${g.googleOverlap.retrievedInGoogleTop10.join('、') || '无'}`,
      `- 引用来源（cited）：${Object.entries(g.citedDomainFrequency).map(([d, c]) => `${d}×${c}`).join('、') || '（无）'}；有引用的占比 ${g.citedShare}；引用里在 Google 前 10 的：${g.googleOverlap.citedInGoogleTop10.join('、') || '无'}`,
      `- AI 自标类型计数：${JSON.stringify(g.kindsCount)}；推荐名单之外的检索/引用 URL 里博客榜单占比 ${g.listicleShareOfUrls}`, `- 历史兼容字段 slotHint：${g.slotHint}`, '');
  }
  L.push('## 按问法：首次回答外部产品点名率', '', '只用已有推荐/文本域名解析判断点名（是/否）；引用或检索命中不单独算点名，失败为未知。解析不能识别没有域名的纯名称，须回读原回答。回答中没有任何外部产品时，说明该问法下推荐位不存在（ChatGPT 自己当工具），不等于被筛掉；解析空名单本身不能证明原文没有产品。这是 2026-10-03 一次试点的实测发现（8 个问法里 6 个无外部推荐）。', '');
  for (const q of s.questions) {
    L.push(`- 问法：${q.prompt}；通道 ${q.channel}；样本 ${q.sampleMode}；点名率 ${q.namedCount}/${q.nKnown}（${q.namingRate ?? '未知'}）；95% Wilson 区间 ${q.namingRateWilson95?.join('–') || '未知'}；未知 ${q.nUnknown}`);
    for (const r of q.samples) L.push(`  - ${r.label}：首次回答是否点名外部产品/网站=${r.firstResponseNamesExternalProduct === null ? '未知' : r.firstResponseNamesExternalProduct ? '是' : '否'}`);
  }
  const multi = results.filter(r => r.turns);
  if (multi.length) {
    const domains = t => uniq([...(t?.citedDomains || []), ...(t?.textDomains || [])].map(canon));
    const freq = entries => {
      const counts = {};
      for (const ds of entries) for (const d of ds) counts[d] = (counts[d] || 0) + 1;
      return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([d, n]) => `${d}×${n}`).join('、') || '（无）';
    };
    const excerpt = (t, pattern) => {
      const lines = (t?.answer || '').split('\n').map(l => l.trim()).filter(Boolean);
      return (lines.find(l => pattern.test(l)) || lines[0] || '（未完成）');
    };
    L.push('## 多轮', '', `- 第 1 轮推荐/引用域名出现次数（引用与文本链接，每样本去重）：${freq(multi.map(r => domains(r.turns[0])))}`, '', '### 第 2 轮不足（逐样本原文摘 1 行）', '');
    for (const r of multi) L.push(`- ${r.label}：${excerpt(r.turns.find(t => t.n === 2 && t.ok), /weak|downside|limit|drawback|不足|缺点|缺陷|局限|слаб|недостат|Schwäch|Nachteil/i)}`);
    L.push('', '### 第 3 轮其他产品', '', '- 是否改荐由原文判断；新增域名只表示相对第 1 轮首次出现，不自动判定推荐。');
    for (const r of multi) {
      const third = r.turns.find(t => t.n === 3 && t.ok);
      L.push(`- ${r.label}：${excerpt(third, /recommend|instead|better|推荐|更好|рекоменд|besser|empfehl/i)}；新增域名：${third ? domains(third).filter(d => !domains(r.turns[0]).includes(d)).join('、') || '（无）' : '（未完成）'}`);
    }
    L.push(`- 第 3 轮域名出现次数：${freq(multi.map(r => domains(r.turns.find(t => t.n === 3 && t.ok))))}`);
    const completed = multi.map(r => r.turns.filter(t => t.ok).length);
    L.push('', `- 完成轮次分布：3 轮 ${completed.filter(n => n === 3).length}；2 轮 ${completed.filter(n => n === 2).length}；1 轮 ${completed.filter(n => n === 1).length}；失败（0 轮）${completed.filter(n => n === 0).length}；中途失败 ${multi.filter(r => !r.ok).length}`, '');
  }
  L.push('## C 型（追问：把 Google 前 3 摆给它）', '');
  for (const c of s.C) {
    L.push(`- 联网=${c.searched}；第一推荐：${c.firstPick ? `${c.firstPick.name} (${c.firstPick.domain})` : '（无）'}`);
    for (const v of c.verdicts || []) L.push(`  - ${v.domain}：${v.would_recommend ? '会推荐' : '不推荐'}；${v.reason}；弱点：${v.weakness}`);
    if (c.newProductWinsIf) L.push(`  - 新产品要具备：${[].concat(c.newProductWinsIf).join('；')}`);
  }
  L.push('', '## AI 自己指出的市场空白（去重）', '', ...(s.marketGaps.length ? s.marketGaps.map((m) => `- ${m}`) : ['- （无）']), '');
  L.push('## 逐次明细', '', '| 次 | 成功 | 联网 | 检索命中 | 引用 | 耗时 | 名单（按序） |', '|---|---|---|---|---|---|---|');
  for (const r of results.sort((a, b) => a.label.localeCompare(b.label))) L.push(`| ${r.label} | ${r.ok ? 'ok' : r.failure} | ${r.searched} | ${(r.retrieved || []).length} | ${(r.cited || []).length} | ${r.durationMs ? (r.durationMs / 1000).toFixed(0) + 's' : '-'} | ${r.reco.list.map((x) => x.domain + (x.verified ? '' : '?')).join(' > ') || '（空）'} |`);
  L.push('', '域名后带 `?` 表示模型自报、未在文本链接或检索命中里核实到。');
  if (s.failures.length) L.push('', ...s.failures.map(f => `- 失败 ${f.label}（${f.failure}）：${f.error}；pageText：${(f.pageText || '').replace(/\s+/g, ' ')}`));
  return L.join('\n') + '\n';
}

const isMain = process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url));
if (isMain) main().then((c) => process.exit(c), (e) => { console.error(e); process.exit(1); });
