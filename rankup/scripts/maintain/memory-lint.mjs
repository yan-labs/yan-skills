import { stripFences } from "./doc-lint.mjs";

// Recognize both current rules and dated entries in existing project files.
export const experienceEntry = /^- (?:\*\*\[20|(?=[^\n]+(?:[。；][ \t]*|\n[ \t]{2,})适用[：:]\s*\S))/;
const attribution = /用户\s*(?:20\d{2}[-/])?\d{1,2}[-/]\d{1,2}(?!\d)/u;
const longQuote = /(?:「[^」\n]{40,}」|『[^』\n]{40,}』|“[^”\n]{40,}”|‘[^’\n]{40,}’|"[^"\n]{40,}")/u;
const date = /(?<![\d\w])(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}月\d{1,2}日)(?!\d)/u;

function decisionRules(lines) {
  let level = 0;
  return lines.map((line, i) => {
    const heading = line.match(/^(#{1,6})\s+(.*)/);
    if (heading && heading[1].length <= level) level = 0;
    if (heading && /^(?:仍有效的)?规则(?:条目|部分)?\s*$/.test(heading[2].trim())) {
      level = heading[1].length;
      return "";
    }
    if (level) return line;
    const rule = line.match(/^\s*-\s+规则[：:]\s*(.*)/);
    if (rule) return `- ${rule[1]}`;
    return /^ {2,}\S/.test(line) && /^\s*-\s+规则[：:]/.test(lines[i - 1] || "") ? line : "";
  });
}

function bigrams(text) {
  return new Set(Array.from(text.slice(0, -1), (_, i) => text.slice(i, i + 2)));
}

// Warnings use line numbers only so rule text and quotations stay in the source file.
export function lintMemory(text, { maxLines = 150, decisions = false, index = false } = {}) {
  const rawLines = text.trimEnd().split("\n");
  const lines = stripFences(text.trimEnd());
  const rules = decisions ? decisionRules(lines) : lines;
  const warnings = [];
  const warn = (check, detail, line) => warnings.push({ check, detail, line });
  const length = decisions ? rules.filter((line) => line.trim()).length : rawLines.length;
  if (length > maxLines) warn("超长", `${length} 行 > ${maxLines} 行`);
  if (index) return warnings;

  const nonempty = rules.filter((line) => line.trim() && !/^\s*#/.test(line));
  const dated = nonempty.filter((line) => date.test(line) || attribution.test(line)).length;
  if (dated >= 3 && dated / nonempty.length >= 0.25) warn("日期密度", `${dated}/${nonempty.length} 个正文行含日期`);

  const entries = [];
  for (const [i, line] of rules.entries()) {
    if (attribution.test(line) || longQuote.test(line)) warn("原话或日期出处", "将原话或事件移入记录，规则仅留短指针", i + 1);
    const bullet = line.match(/^\s*[-*+]\s+(.+)/);
    if (!bullet && !line.trim()) continue;
    const continuation = bullet && /^ {2,}\S/.test(rules[i + 1] || "") ? rules[i + 1] : "";
    const entry = `${bullet?.[1] ?? line} ${continuation}`;
    if (!/^ {2,}\S/.test(line) && /禁止|一律|从不/.test(entry) && !/适用\s*[：:]\s*\S/.test(entry)) {
      warn("缺适用条件", "绝对词需写明适用范围", i + 1);
    }
    if (!bullet) continue;
    const key = bullet[1].replace(/^\*\*\[[^\]]+\]\s*|^【[^】]+】\s*/u, "")
      .split(/[。；]\s*(?:适用|因为|验证|例|来源)[：:]/u)[0]
      .toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (!key) continue;
    const grams = bigrams(key);
    const similar = entries.find((prior) => {
      if (key === prior.key) return true;
      if (Math.min(key.length, prior.key.length) < 8) return false;
      const common = [...grams].filter((gram) => prior.grams.has(gram)).length;
      return common / (grams.size + prior.grams.size - common) >= 2 / 3;
    });
    if (similar) warn("近似重复", `与第 ${similar.line} 行相似`, i + 1);
    entries.push({ key, grams, line: i + 1 });
  }
  return warnings;
}
