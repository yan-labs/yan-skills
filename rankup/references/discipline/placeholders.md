# 纪律十四：占位红线（全文）

> 入口在 [`discipline.md`](../discipline.md) 十四，那里只留一句规则；本文件是全文（2026-11-27 从 discipline.md 拆出）。

**任何页面不得出现占位链接、占位文案、占位图片、占位联系方式、占位法律页。** Google 会把这种页面判成垃圾站，
一旦判定，后面的 SEO 全白做。宁可整块删掉，也不留一个占位——**处置原则是「宁可整块删掉，不留占位」**，
不允许「先留着，后面再补」。

**这条红线开发期一直有，实际漏法是上线时没人复核。** 段 3 开发时禁令写在这里，但闸门清单和上线前 review
过去没有把「占位专项复查」列成独立必过项，于是出现「开发时知道不许有占位、上线前没人对着清单专门查一遍」的
执行缺口——多个站上线后仍被发现有占位超链接、占位文案。因此本条同时是段 3（开发期自查）、段 4（上线前 review，
逐 URL 复查）、段 5（放开索引前重跑）三处闸门的判据来源，任何一处「过不了」都不许放行到下一段。

### 占位的五个类型

1. **占位链接**：`href="#"`、`href="javascript:void(0)"`（或任何 `javascript:void` 变体）、指向 `example.com` /
   `example.org` / `example.net` 的链接、指向站内不存在页面（404）的 `href`、锚文本或链接目标违反[二十一](../discipline.md#二十一禁止建设中内容与功能区域)的空壳、社交图标 `href="#"`（图标位摆在那但没有真实主页）。
2. **占位文案**：lorem ipsum、`FIXME` 标记（建设中类文案统一见[二十一](../discipline.md#二十一禁止建设中内容与功能区域)）、"Your text here"、单独出现的 "Lorem"、
   方括号模板变量（如 `[Company]`、`[Product Name]`、`[Your Name]`、`[Address]`）、违反[二十一](../discipline.md#二十一禁止建设中内容与功能区域)的空壳文案、未替换的模板变量（如 `{{title}}`、`{{company_name}}`）。
3. **占位图片**：`placehold.co`、`via.placeholder.com`、`picsum.photos`、`dummyimage.com` 这类占位图床、
   文件名含 `placeholder` 的图片（如 `placeholder.png`）、空 `src`（`src=""`）、缺图导致 broker/图标位显示
   浏览器默认破图标。
4. **占位联系方式**：`your@email.com` 这类模板邮箱、`+1 234 567` / `+1 234 567 8900` 这类模板电话号码。
5. **占位法律页**：隐私政策 / 服务条款里残留脚手架或模板自带的公司名、地址、示例条款，没有替换成本项目真实信息。

### 检测方法：grep 正则（线上 HTML 与源码都能用）

```bash
# 占位链接
grep -noE 'href\s*=\s*"#"|href\s*=\s*"javascript:void\(0?\)?"|href\s*=\s*"[^"]*example\.(com|org|net)[^"]*"' <file-or-html>

# 占位文案
grep -noiE 'lorem ipsum|\bFIXME\b|your text here' <file-or-html>
# 建设中类文案用二十一的渲染产物检查器，不对裸源码套词表
grep -noE '\[(Company|Company Name|Product|Product Name|Your Name|Address)\]|\{\{\s*[a-zA-Z_.]+\s*\}\}' <file-or-html>

# 占位图片
grep -noiE 'placehold\.co|via\.placeholder\.com|picsum\.photos|dummyimage\.com' <file-or-html>
grep -noE 'src\s*=\s*"[^"]*placeholder[^"]*\.(png|jpg|jpeg|svg|webp)"|src\s*=\s*""' <file-or-html>

# 占位联系方式
grep -noiE 'your@email\.com|\+1[\s.-]*234[\s.-]*567([\s.-]*8?9?0?0?)?' <file-or-html>
```

对**源码**跑：`grep -rn` 上面每条正则到项目根（排除 `node_modules`、构建产物）。
对**线上 HTML**跑：按 sitemap 逐 URL `curl` 下来再跑同一批正则，不能只抽查首页——「没人想起来改」的
往往正是流量最小、review 时最容易被跳过的那一页。

`scripts/seo-audit.mjs` 已把这批正则内置为每页 issues 里的 `PLACEHOLDER_*` 系列 code（源码见脚本内
`analyzePlaceholders` 函数），跑 `--sitemap` 时自动逐页命中，不需要额外开关；命中即代表这一页有占位，
不看分级、不看阈值，出现即算数。

### 处置原则

**宁可整块删掉，也不留一个占位。** 内容没准备好就不渲染那个区块，不写占位再等以后回填——「先占位再回填」
是这条红线实际被踩过的失败模式：占位一旦上线就没人会再回来补，等到被发现时已经是「上线后仍有占位」的既成事实。

上线前闸门（段 4）与放开索引前复查（段 5）要按 sitemap 全站扫一遍，扫描口径在 [`checklists.md`](../checklists.md)。
