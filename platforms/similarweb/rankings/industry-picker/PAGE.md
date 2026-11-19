# Website Rankings · 行业选择器（首页）

## 页面身份

- URL 模板：`https://sim.proxy.example.com/#/digitalsuite/markets/webmarketanalysis/home`（**无参数**）
- 上级：`../OVERVIEW.md`；真正的榜单页在 `../category-board/PAGE.md`

## 回答什么业务问题

**它自己不产数据。** 存在的唯一价值是：**当你不知道某个行业的 slug 长什么样时，
在这里选一次，把落地 href 抄下来。** 之后一律走深链，不要再走这三步。

## 数据清单

- **一个自动弹出的搜索式选择器覆盖层**，标签写 `行业 (217)`，
  下面是可滚动的两级列表：`所有行业` → `AI Chatbots and Tools` → 大类（如「艺术与娱乐」）
  → 子类（缩进，如「动漫」「其他艺术与娱乐相关」）……
  **共 26 个大类 + 子类 = 217 项**，与旧档案一致。
- **覆盖层背后是一张空报表壳**：站点排名标题、日期段、国家、`所有流量`、`包括子域名`，
  **9 个渠道 tab**（所有 / 搜索 / 社交 / 显示广告 / 外链 / 直接 / 电子邮件 /
  生成式 AI / 联盟合作方），正文写「搜索并分析行业 / 搜索您要分析的行业，以查看此报告」。
- 未选行业时页头显示 `行业无效 / 不适用`。

## 形状与就绪

- `readyBranch=**null**`，`stopReason=budget`，**exit 2**，24 polls、2 次自动 refresh。
- **exit 2 在这页不是「空」**：`cells=0`、`svgText=0` 是**正确的**
  （本页确实既没有表也没有图），但 `deep.textLength=1,600,394`，
  **deepText 里 217 个行业名一个不少**。
- 那两次自动 refresh 是 **stall-refresh 分支在空转**——本页永远「不动」，
  因为它根本没有东西要水合。这是 `round3-machine-blind-routes` 教训的**第 6 个实例**。
- 正确读法：exit 2 之后 **grep deepText**，而不是加预算。

## 怎么采

一般不需要采。真要留档：

```sh
platforms/similarweb/rankings/industry-picker/collect.sh [out-dir]
```

脚本以 `|| [ $? -eq 2 ]` 收尾——**exit 2 是本页的预期收尾，不是失败。**

## 选行业的三步配方（只在不知道 slug 时用一次）

1. 覆盖层若未自动展开：CDP 点 `[class*=CategoryItemWrapper]`
   （页头那块「行业无效 / 不适用」）。
2. 往 `input.sc-ligLZB`（覆盖层里唯一那个无 placeholder 的 input）打字，列表实时过滤，
   标签从 `行业 (217)` 变成 `行业 (1)`；结果行文本是**面包屑格式**
   （如 `计算机电子技术 > 多媒体图像和网站设计`）。
3. CDP 点结果行 `[class*=sc-bACmPo]`，**多匹配时必须带 `--nth 0`**
   （不带会 `matches_n: 3` 而点不动）。

**落地 URL（本轮实测）**：

```
#/digitalsuite/markets/webmarketanalysis/mapping/
  Computers_Electronics_and_Technology~Graphics_Multimedia_and_Web_Design/840/1m?webSource=Total
```

- slug 用 `~` 分层级，与第二轮猜测直达的形状完全一致。
- ⚠️ **国家段落地是 `840`（美国）不是 `999`**：面板记住了上一次 UI 选的国家并写进新 URL。
  **URL 模板永远以落地 href 为准。**

## 已知坑

| 坑 | 细节 |
|---|---|
| **exit 2 ≠ 空** | 三条就绪分支全盲；判读靠 deepText grep + AI 读图 |
| **stall-refresh 会空转** | 本页没有东西要水合，刷新解决不了任何问题；别靠加预算 |
| **国家段被改写** | 落地 `840` 而非 `999`；抄落地 href |
| 语义点击不可靠 | `click --text 行业无效` 直接 `semantic_not_found`；一律用 CSS 选择器 + CDP |
| 白屏 | 裸 `open` 后遇到一次白屏空壳，`location.reload()` 一次即愈（**镜像抖动，非封锁**） |
| **选择器本身没有采集价值** | 进类目一律用深链 slug；这三步只跑一次 |

## 验证记录

- **2026-08-30** 双证人采集，会话 `similarweb-nav`，机器级
  `tools-share-similarweb` 锁全程持有；手动探路（CDP 点击、搜索框输入）在
  持同样两把锁的 scratchpad 脚本里完成，退出即释放。
  截图（树全展开态 + 过滤态）⇄ census 一致：`行业 (217)`、两级列表结构、
  9 个渠道 tab、空态文案。
  证据（本地，gitignore）：
  `backlink/evidence/ground-truth/similarweb-round4-rankings-home/`。
- 截图档案：`assets/loaded.png`（覆盖层展开态）、`assets/selector-filtered.png`（输入过滤后）。
