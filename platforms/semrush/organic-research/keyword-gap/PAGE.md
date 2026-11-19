# Organic Research · Keyword Gap（关键词差异）

## 页面身份

结果页可 **URL 直达**，不需要走表单（本板块最硬的产出）。三域名对比模板全文：

```
https://sem.proxy.example.com/analytics/keywordgap/?q=<you>&searchType=domain&rankType=<bucket>&db=us&compareWith=<comp1>%3Adomain%3Aorganic%7C<comp2>%3Adomain%3Aorganic
```

- `q`：「您」的域名；`db`：数据库（us）
- `compareWith`：每个条目 = `域名:searchType:关键词类型` → URL 编码为
  `<域名>%3Adomain%3Aorganic`；**多个竞争对手用管道 `|`（%7C）分隔，绝不能用逗号**
- `rankType`：分桶开关，`common` 与 `missing` 已实证直达；弱/强/尚未开发/唯一/所有 同参数位
- 子域名可作对比列（express.adobe.com 实测被接受）
- **必须 2+ 域名**：只带 `q` 不带 `compareWith` 落在「您 + 最多 4 个竞争对手」的表单页，
  无任何结果——单域名进不去结果页，采到的是退化表单态，不构成功能证据

## 回答什么业务问题

竞品有排名而你没有（missing）、或你排得弱（weak）的词——抄竞品选题的直接来源。
missing + untapped 分桶加意图过滤，是最快的「该 niche 必做题」清单。

## 数据清单（canva.com vs figma.com vs express.adobe.com，db=us，2026-08）

1. **最佳机会卡**（缺失/弱 两 tab）：词 + 搜索量。样例：design thinking 1,830,000。
2. **韦恩图**：三圆重叠 + 图例（canva 729.6K / figma 160K / adobe 3.5M）。
3. **七个分桶**（tab 栏带计数）：

| 桶 | rankType | 含义 | 规模示例 |
|---|---|---|---|
| 共同 | `common` | 三家都有排名的词 | 45.4K |
| 缺失 | `missing` | **所有竞品有、你没有**——选题金矿 | 24.9K |
| 弱 | `weak` | 你有排名但低于所有竞品 | 8.2K |
| 强 | `strong` | 你高于所有竞品 | 24.6K |
| 尚未开发 | `untapped` | 至少一个竞品有、你没有 | 3.1M |
| 唯一 | `unique` | 只有你有 | 288.1K |
| 所有 | `all` | 并集 | 3.9M |

4. **主表**（1,000 格）：关键词 / 意图 / canva.com / figma.com / express.adobe.com /
   搜索量 / KD% / CPC / 竞争 / 结果。三个域名列 = 各自排名位次。
   missing 桶行样例：design thinking（canva 0 / figma 11 / express 23，1.8M，KD91）。

## 形状与就绪

- 形状：table（readyBranch=table），就绪判据 `filledCells > 0`，实测约 29 秒
  （含 stall-refresh 一次：前 3 轮停在 1.6M 壳 filledCells=0，reload 后 10 秒内出数据）。
- 入口/结果页水合都看心情，卡壳刷新是常规操作，不是异常。

## 怎么采

```sh
platforms/semrush/organic-research/keyword-gap/collect.sh [you] [comp1] [comp2] [bucket]
# 例：collect.sh canva.com figma.com express.adobe.com missing
# 默认 canva.com figma.com express.adobe.com missing
```

内部一条 `node backlink/scripts/ground-truth.mjs --url … --budget 240`，自动持
semrush 机器锁、会话 `semrush-nav`。换桶只换第 4 个参数。配额纪律见 `../../OVERVIEW.md`。

**手动驱动表单时**（只在 URL 直达不够用时）：表单是 React 受控组合框，全埋 shadow DOM——
- opencli 的 find/click/state（AX 层）完全看不见它
- 合成 `value` setter 会把组件打崩（re-render 后连 input 都查不到）
- 可用配方：`el.focus()` + `document.execCommand("insertText")` 打字 →
  `opencli keys Enter` 提交 → 纯 `button.click()` 点「比较」
- **别用 Escape 收下拉**——会清掉未提交文本

## 已知坑

| 坑 | 细节 |
|---|---|
| **假付费墙** | compareWith 条目间用逗号（%2C）会吞掉第二条的 `:domain:organic`，稳定复现「升级到 Business」整页模糊弹窗。这不是套餐问题——换 `|`（%7C）同样三域名立即出全量数据。**看见升级弹窗先查自己的 URL 编码** |
| 图例根域归一化 | 韦恩图把 express.adobe.com 显示成「adobe.com 3.5M」；域名以表格列头为准，绝不读图例 |
| 单域名退化态 | 无 compareWith 只 render 空表单；对比类工具必须喂满输入才可下任何能力判断 |
| 壳 1.6M 骗文本判据 | 与全平台一致：就绪只认 filledCells |

## 验证记录

- **2026-08-29**（UTC 11:19–11:30）双证人判决，会话 `semrush-nav`，整轮持锁：
  - common 桶：七分桶计数、faq templates 1/26/15、qr code generator 3/21/1 像素↔DOM 全命中
  - missing 桶 URL 直达：缺失 tab 高亮 + canva 列全 0（design thinking 0/11/23）双证人证明
  - 逗号分隔符 → 付费墙形态复现（反面教材留档）
- 证据（本地，gitignore）：`backlink/evidence/ground-truth/semrush-keywordgap-3domain/`（正确形态）、
  `…-3domain-missing/`（分桶直达）、`…-canva-figma-adobe/`（假付费墙）、
  `…-entry/`（单域名 INVALID）；判决书 `…/semrush-organic-VERDICTS.md`。
- 截图档案：`assets/buckets.png`（七分桶 tab 栏 + 三域名列主表首屏）。
