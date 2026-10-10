#!/usr/bin/env python3
"""中文稿件体检：硬禁项 + 提示项 + 节奏统计 + 字符清理。

用法:
  python3 check.py draft.md           # 输出体检报告
  python3 check.py --clean draft.md   # 输出清理后的文本（不可见字符、异常空格、中文后的半角标点、行尾空白）
硬禁项必须清零；提示项回到上下文判断；档位只是分诊，不是对作者的判断。
代码块、行内代码、网址、front matter 不检查也不改。
"""
import re
import statistics
import sys

HARD = {
    "翻案腔": r"不是[^。！？\n]{1,25}[，,]\s*(而)?是|而是|并非|不仅[^。！？\n]{0,20}(而且|更是|也是)|与其说|不在于[^。！？\n]{0,20}而在于|表面[^。！？\n]{0,15}实际|看似[^。！？\n]{0,15}实则|你以为[^。！？\n]{0,20}其实|回头才发现|答案恰恰相反|说到底",
    "破折号": r"——|—|–",
    "提示性冒号": r"(总结|核心|关键|结论|重点|答案|原因|一句话|简单来说|总之)[是为]?\s*[：:]",
    "口头路标": r"说白了|说穿了|先说结论|更微妙的是|还有一层|只说对了一半|值得注意的是|需要指出的是|从某种意义上说",
}
SOFT = {
    "黑话与宣传语": r"赋能|助力|打造|深耕|抓手|闭环|底层逻辑|颗粒度|沉淀|链路|生态|愿景|全方位|一站式|无缝|革命性|引领|赛道|矩阵",
    "客服与聊天残留": r"希望(这|以上)?[^。\n]{0,6}(对你|对您)?有帮助|当然可以|好的[，,]以下|作为一个?\s*AI|如有(任何)?疑问|欢迎随时|让我们一起",
    "套话开头收尾": r"在当今[^。\n]{0,10}(时代|社会)|随着[^。\n]{0,20}的(不断)?发展|综上所述|总而言之|总的来说|不可否认|毋庸置疑|未来可期|前景广阔",
    "进行加动词": r"进行(了)?[^\s，。]{1,3}(分析|研究|讨论|优化|处理|改进|调整|检查)",
    "比喻与花腔": r"就像|如同|仿佛|好比|堪比|犹如|宛如|画卷|织就|谱写|扬帆|护航|注入[^。\n]{0,4}活力|点燃|绽放",
    "抽象名词配抒情动词": r"(时间|岁月|焦虑|孤独|记忆|命运)(会|能|总)?(保管|磨平|显出|雕刻|吞没|拥抱)",
    "小结标题": r"^#{1,6}\s*(小结|总结|结语|写在最后)\s*$",
}
CJK = r"一-鿿㐀-䶿"
INVISIBLE = re.compile("[​‌‍⁠﻿­‪-‮⁦-⁩]|[\U000e0000-\U000e007f]")
ODD_SPACE = re.compile("[  -   　]")
HALF_AFTER_CJK = re.compile(rf"(?<=[{CJK}”’」』）])([,;:?!])")
EMOJI = re.compile("[\U0001F300-\U0001FAFF☀-➿]")
CODE = re.compile(r"```.*?```|`[^`\n]+`|https?://\S+", re.S)
FRONT = re.compile(r"\A---\n.*?\n---\n", re.S)


def mask(text):
    """把代码、网址、front matter 换成同长度占位，保持行号不变。"""
    def blank(m):
        return re.sub(r"[^\n]", " ", m.group(0))
    return CODE.sub(blank, FRONT.sub(blank, text))


def locate(text, pattern, flags=0):
    for m in re.finditer(pattern, text, flags | re.M):
        line = text.count("\n", 0, m.start()) + 1
        a = max(0, m.start() - 8)
        yield line, text[a:m.end() + 8].replace("\n", " ")


def sentences(text):
    plain = re.sub(r"^#{1,6}.*$|^\s*[-*]\s", "", text, flags=re.M)
    return [s for s in re.split(r"[。！？\n]+", plain) if len(s.strip()) > 1]


def cv(values):
    return statistics.pstdev(values) / statistics.mean(values) if len(values) > 2 and statistics.mean(values) else 1.0


def clean(text):
    parts, last = [], 0
    for m in list(CODE.finditer(text)) + list(FRONT.finditer(text)):
        parts.append((last, m.start(), True))
        parts.append((m.start(), m.end(), False))
        last = max(last, m.end())
    parts.append((last, len(text), True))
    out = []
    for a, b, prose in sorted(parts):
        seg = text[a:b]
        if prose:
            seg = INVISIBLE.sub("", seg)
            seg = ODD_SPACE.sub(" ", seg)
            seg = HALF_AFTER_CJK.sub(lambda m: dict(zip(",;:?!", "，；：？！"))[m.group(1)], seg)
            seg = re.sub(r"[ \t]+$", "", seg, flags=re.M)
        out.append(seg)
    return "".join(out)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    raw = open(args[0], encoding="utf-8").read() if args else sys.stdin.read()
    if "--clean" in sys.argv:
        sys.stdout.write(clean(raw))
        return
    text = mask(raw)
    report, hard_total, soft_kinds = [], 0, 0
    for name, pat in HARD.items():
        hits = list(locate(text, pat))
        hard_total += len(hits)
        if hits:
            report.append(f"[硬禁] {name} x{len(hits)}")
            report += [f"    L{l}: …{s}…" for l, s in hits[:6]]
    for name, pat in SOFT.items():
        hits = list(locate(text, pat))
        if hits:
            soft_kinds += 1
            report.append(f"[提示] {name} x{len(hits)}")
            report += [f"    L{l}: …{s}…" for l, s in hits[:4]]
    half = list(locate(text, HALF_AFTER_CJK.pattern))
    if half:
        report.append(f"[字符] 中文后半角标点 x{len(half)}（--clean 可转全角）")
    inv = len(INVISIBLE.findall(raw)) + len(ODD_SPACE.findall(raw))
    if inv:
        report.append(f"[字符] 不可见或异常空格 x{inv}（--clean 可清除）")
    bold = len(re.findall(r"\*\*[^*\n]+\*\*", text))
    emoji = len(EMOJI.findall(text))
    if bold > 3:
        report.append(f"[提示] 加粗 x{bold}，叙事和论述正文应平铺")
    if emoji:
        report.append(f"[提示] emoji x{emoji}")
    sents = sentences(text)
    lens = [len(s) for s in sents]
    longs = [s for s in sents if len(s) > 45]
    if longs:
        report.append(f"[提示] 超过 45 字的长句 x{len(longs)}，例：…{longs[0][:30]}…")
    body = re.sub(r"^#{1,6}.*$", "", text, flags=re.M)
    paras = [len(p.strip()) for p in re.split(r"\n\s*\n", body) if p.strip()]
    stats = f"句数 {len(lens)}，句长变异 {cv(lens):.2f}，段数 {len(paras)}，段长变异 {cv(paras):.2f}"
    flat = len(lens) > 8 and cv(lens) < 0.35
    openers = [s.strip()[:2] for s in sents]
    rep = any(openers[i] == openers[i + 1] == openers[i + 2] for i in range(len(openers) - 2))
    if flat:
        report.append("[节奏] 句长变异低于 0.35，读着像节拍器，检查是否被改平")
    if rep:
        report.append("[节奏] 连续三句同一开头")
    score = min(100, hard_total * 12 + soft_kinds * 8 + (10 if flat else 0) + (10 if rep else 0))
    band = "clean" if score <= 20 else "轻度" if score <= 40 else "混合" if score <= 60 else "重度"
    print(f"档位 {band}（{score}）｜硬禁 {hard_total}｜{stats}")
    print("\n".join(report) if report else "无命中")
    sys.exit(1 if hard_total else 0)


if __name__ == "__main__":
    main()
