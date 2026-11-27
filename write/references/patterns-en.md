# 英文去模板化模式清单

这是检查线索，不是词语黑名单。提示项回到上下文判断；硬禁的翻案句、破折号、提示性冒号与口头路标清零。改句子前先找它实际想表达的事实，不删真实否定、条件或归因。其他拉丁字母语言可借用检查思路，不把英文词表当作该语言词表。

## 机器检测的级别与边界

- **硬禁翻案**：`not just/only/merely/simply X, (but) Y`、句首省略主体的 `Not X but Y`、`not X but rather Y` / `not X, instead Y`、`more than just X`、`isn't/is not/it's not about X, it's/it is about Y`、`X isn't/is not the problem, Y is`、`no longer X, now Y`。`it/this/that is not a/an/the + 单个名词` 后接 `it is/it’s/this is/that’s/they are/we are/instead/rather` 或 `but a/an/the …` 的重新定义也硬禁，例如 `It is not a tool; it is a partner.`。全写、直弯撇号和大小写均支持；逗号、分号、句号或换行可连接后半句。`not only A but also B` 是正常递进，不报翻案硬禁。
- **可能让步仅提示**：普通动作的 `did/does/do not …, but …`（含缩写）及形容词否定后转折，如 `She did not call, but she wrote.`、`It was not a bad idea, but it was slow.`、`I do not want tea, but coffee is fine.` 均**不应硬禁**；`It is not a bad idea, but it is slow.` 同样仅提示。普通 `not … but …` 不再一概硬禁；拿不准时一律提示「可能是让步句，如是在重新定义主体请改写」，不影响退出码。没有后半转折的普通否定不命中。
- **口头路标硬禁**：句首 `It's/It is worth noting`、`Let's dive in / delve / unpack` 等；**套话仅提示**：句首 `Whether you're/you are X or Y`、`In today's … world/landscape`、`In conclusion / Ultimately / In summary`。收尾词只按句首识别，不猜文章含义。
- **其余仅提示**：已有高频词、空泛形容、三项并列、客服残留和清单中的固定比喻/借权威短语。连续三句相同前两词，或不超过 12 词的短句相同首词，提示节奏复读；不做语法分析，不能覆盖所有同结构句。列表数量与装饰标题是否过多、隐含比喻和无来源断言仍需人工判断。
- 英文检查屏蔽引号内的引文、Markdown `>` 引用及代码；不清理或改写引文。每个翻案分句限 160 字符；普通名词重新定义只对上述明确结构硬禁，复杂名词短语、长分句和隐含翻案仍需人工通读。引用屏蔽不适用于中文，保留既有中文行为。

## 一、拿修辞动作抬价

| 模式 | 坏例子 | 处理与改法 |
|---|---|---|
| 翻案腔：not X, but Y | “This is not a tool, but a revolution.” | 删掉否定半句和拔高，直说：“This tool sorts your files.” 仅在原稿有这个功能事实时这样写 |
| 翻案腔：it's not just X, it's Y / more than just | “It's not just an editor, it's your creative partner.” / “More than just storage.” | 去掉人为设立的对立：“Edit your draft.” / “Store your files.” 不凭空补功能 |
| 破折号滥用 | “Upload a photo — we do the rest.” / “Save time -- start here.” | 换句号或直接连接：“Upload a photo. We do the rest.” / “Start here to save time.” |
| 提示性冒号 | “The takeaway: You can export a PDF.” / “Here's the key: Back up your files.” | 删除提示半句：“You can export a PDF.” / “Back up your files.” 正常字段、FAQ 的 Q: / A: 不属于此类 |
| 口头路标 | “Here's the thing: You need one photo.” / “It's worth noting that exports take a minute.” | 删掉路标：“You need one photo.” / “Exports take a minute.” |
| 套话开头与收尾 | “In today's fast-paced world, teams need clear notes.” / “In conclusion, let's dive in.” | 直接写：“Teams need clear notes.” 空转的收尾整句删除；“Let's dive in” 作开场也删除 |

## 二、节奏

| 模式 | 坏例子 | 处理与改法 |
|---|---|---|
| 三段式并列排比 | “Create faster, collaborate better, achieve more.” | 写实际动作：“Share the draft with your team.” 三项真实事实清单可保留，不为减项删事实 |
| 句式开头复读、句段长度过匀 | “You can upload. You can edit. You can export.” | “Upload a file, edit it, then export it.” 只在确有流程顺序时合并；否则保留原关系 |
| 长句塞满多个主张 | “Upload a file and edit the text and share it with the team while tracking every change in one place.” | 按主张拆句：“Upload a file and edit the text. Share it with your team and track changes.” 35 词以上先回看，不硬限长度 |

句长、段长以词数观察。变异低于 0.35 只提示节奏可能过匀，不凭统计重写正常稿。

## 三、拔高与借权威

| 模式 | 坏例子 | 处理与改法 |
|---|---|---|
| 高频 AI 词堆砌 | “Delve into a tapestry of ideas to unlock and elevate your potential.” / “A seamless game-changer to navigate the landscape.” | 删除空泛包装，按原有事实直说；若原意只是邀请阅读，可写 “Read the ideas below.” 没有事实就删，不换一组宣传词 |
| 空泛正面形容堆叠 | “An innovative, powerful, revolutionary editor.” | “An editor.” 有已核实的具体功能再写功能，不编结果与数字 |
| 矫饰比喻 | “A lighthouse in the ocean of data.” / “Weave your dreams into a digital tapestry.” | 还原原文主张，如确实是检索功能：“Find the record you need.” 没有可还原主张就删除；全篇骨架 leading word 的单一例外沿用 check.md 红线「矫饰文风」 |
| 借权威或拔高 | “Experts agree this marks a new era.” | 有来源就准确归因、说明具体结论；没有来源就删，不能改成自己的断言 |

## 四、排版

| 模式 | 坏例子 | 处理与改法 |
|---|---|---|
| 加粗、列表与装饰标题过多 | “**Fast.** **Easy.** **Powerful.**” | 删除空泛标签；只给真正多面的内容用列表，叙事写成段落 |
| 不可见字符、异常空格与行尾空白 | “Save your file.  ”（含不换行空格） | `check.py --lang en --clean` 清成普通空格并去行尾空白，不改英文标点 |

## 五、聊天与草稿残留

| 模式 | 坏例子 | 处理与改法 |
|---|---|---|
| 客服腔、对上一稿的旁白 | “Certainly! Here is your revised copy.” / “I hope this helps.” | 整句删除，直接交正文 |

引文与归因按 check.md 红线「引文要标出来」。
