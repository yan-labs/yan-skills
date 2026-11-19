# 竞争对手监控（Competitor Monitoring，EyeOn 后继）——DOM 全盲页型

## 页面身份

- 入口：`https://sem.proxy.example.com/eyeon/` → 302
  `https://sem.proxy.example.com/analytics/traffic/competitor-monitoring?lid=<listId>`
- 直达 `/analytics/traffic/competitor-monitoring/?lid=<listId>` 可重现。
  `lid` = .Trends 列表身份（与市场概览共用「未命名列表 canva.com」，实测 lid=1234565）。
- EyeOn 品牌名已消失：.Trends 左栏 28 项无 EyeOn 字样，302 证实改名「竞争对手监控」。
- 路由挂在 `/analytics/traffic/` 下，但判决与外链批同轮（capability 块
  `<semrush-backlinks-monitoring-capabilities>`），手册归本板块。

## 回答什么业务问题

竞品动态盯梢：新广告创意（带日期/国旗/文案/落地 URL 的时间轴）、新博文、新页面、
社交帖与参与度。

## 要不要建监控：不用

它直接吃 .Trends 列表（lid），**零配置出数**。canva.com 2026/7/25–8/29 实测：
**Google Search Ads 2572 / Blog Posts 0 / New Pages 1656**；仅「社交媒体」维度显示
「未设置」需点「设置」（只读纪律：未点）。

## 形状与就绪：DOM 全盲页型（本平台唯一，重要）

- **穿透 census 全零而像素满数据**：tables / grids / cells / filledCells / svgText /
  canvas / iframe 全部 = 0，deepText 恒 1.599–1.607M 纯壳；开放 shadow root 里无空宿主，
  机制未定（**疑 closed shadow root**）。
- **ground-truth.mjs 的三条就绪分支（cells / svg / text）全部失明，exit 2 不可信**——
  单 DOM 证人会把满页真数据判成空壳。这是
  `every-measurement-needs-two-witnesses` 法条的极端案例：负结论必须双证人，
  而本页 DOM 证人永久缺席。
- `--ready-text` 也救不了：regex 会被左栏同名导航词在 spinner 阶段提前触发
  （实录：`semrush-competitor-monitoring/` 是 census-stable-shot-unstable 停在加载态的
  反面教材）。

## 怎么采：像素-only（截图是唯一证人）

1. foreground 开页（hidden tab 不水合）→ **固定等待，实测约 90–120 秒**；
2. 截图为准，多停留位滚动截图覆盖时间轴；
3. census 仍成对采，但**仅作「壳基线」记录**，读数全部靠 AI 读图；
4. 身份双证替代数字双证：`/eyeon/` 302 落点 + 侧栏高亮「竞争对手监控」。

**本目录不建 collect.sh**：ground-truth.mjs 的自动就绪判据对本页全部失明，
脚本给不出可信的 exit code，「跑完=采到」的假设在这页恒不成立；固定等待 + 逐屏截图 +
AI 读图属于判断活，按「判断层写 md 不写脚本」纪律留在本文档。要采就手动持 semrush
机器锁、会话 `semrush-nav`、foreground 开页照上面配方走。

## 已知坑

| 坑 | 细节 |
|---|---|
| census 说空 ≠ 空 | 本页 DOM 证人全盲，任何基于 census/deepText 的判空一律作废 |
| `--ready-text` 早触发 | 左栏导航词与页面标题同名，spinner 阶段就命中 regex |
| 时间轴多语种 | 广告创意含 pt/es/… 多语种文案，像素抽查要用**整句文案**，别抽单词 |
| 旧路径 404 | `/trends/one2target/` 型旧 app 路径在本镜像一律 404 |

## 验证记录

- **2026-08-30**（会话 `semrush-nav`，整轮持锁）：像素双停留位（shot-s1/s2）一致连贯
  （s1 摘要卡+时间轴头部，s2 时间轴延续），与 302 落点、侧栏高亮互证身份。
  DOM 数字对质不可用（全盲），如实降级为**像素单证人 + 身份双证**。
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-competitor-monitoring-v2/`
  （`…-monitoring/` 为早停 spinner 反面教材）；判决书
  `…/semrush-backlinks-audience-VERDICTS.md` 页卡 6。
- **转写者备注（待复核）**：判决书称深穿透全文 grep 不到「2572」，但留档的
  census-s1.json 的 deepText 片段里可见摘要卡数字（谷歌搜索广告 2572 / Blog Posts 0 /
  New Pages 1656）——摘要卡文本可能在壳文本内，时间轴明细才是真盲区。不影响
  「三条就绪分支失明、采集像素-only」的结论，但「全文 grep 不到」这句**待补测**。
- 截图档案：`assets/loaded.png`（摘要卡 + 广告创意时间轴头部）。
