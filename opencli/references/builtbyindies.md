# BuiltByIndies 提交工作流

以 builtbyindies.com 为目标的产品提交、填表与多产品批量提交的脚本参考。

## 目录

- [平台概览](#overview)
- [致命限制：单帐号单草稿](#limitation)
- [提交完整流程](#flow)
- [表单字段映射](#fields)
- [Karma 系统](#karma)
- [脚本化策略](#scripting)
- [外链价值](#link-value)
- [账户数据](#accounts)

---

<a id="overview"></a>
## 平台概览

BuiltByIndies 是独立开发者的产品发布和展示平台。

| 项目 | 说明 |
|---|---|
| **域名** | https://builtbyindies.com |
| **提交入口** | /submit |
| **免费发布** | 需 10 Karma（社区投票、完成资料、发帖获得） |
| **付费发布** | $9 一次性（立即发布，dofollow 反链） |
| **免费反链** | nofollow（除非投票进前 3 则转 dofollow） |

---

<a id="limitation"></a>
## 致命限制：单帐号单草稿

**任何时刻，一个帐号最多只能存在一个产品草稿。**

提交流程：
1. 进入 /submit → 填表或 Autofill → 点 "Submit Product"
2. 系统对该帐号生成或**覆盖**既有草稿，返回 `/upgrade?product_id=<uuid>`
3. 选择免费或付费发布

这意味着：

> **连续的 Autofill 操作会覆盖前一个草稿。产品 ID 保持不变，但内容被替换。**
> 要提交多个产品，**必须先把前一个发布出去**（需 10 Karma 或 $9），
> 才能开始下一个的 Autofill。

批量提交的唯一路径：**多帐号** 或 **Karma 轮转**。

---

<a id="flow"></a>
## 提交完整流程

### 快速路径：Autofill

```
1. 导航到 https://builtbyindies.com/submit
2. 在 "Autofill details with AI" 输入框填入产品 URL
3. 点 "Autofill" 按钮 → AI 自动填充大部分字段
4. 等待约 30 秒，按钮显示倒计时
5. 查看自动填充的内容（特别注意产品名——可能是原语言）
6. 根据需要编辑任何字段
7. 若 Logo/Cover 未自动填充，手动上传
8. 点 "Submit Product"
9. 重定向至 /upgrade?product_id=<uuid> → 选择发布方式
```

### 字段填充注意事项

**Autofill 的表现：**
- 通常能 100% 完成，包括 Logo + Cover images
- 产品名有时是原语言（日文、中文），需要改成英文
- Cover 图（3-4 张）若未生成，手动上传

**文件输入的隐藏问题：**
```html
<!-- Logo 上传 -->
<input type="file" id="logo-upload" accept="image/*" />

<!-- Cover 图上传（4 个无名 file inputs） -->
<!-- 使用 form 的第一个、第二个、第三个、第四个 file input -->
```

脚本填表时需用 `opencli` 或浏览器自动化**直接写入 file input 的 value**，或上传完成后检验。

---

<a id="fields"></a>
## 表单字段映射

| 字段 | 类型 | 约束 | 必填 | 说明 |
|---|---|---|---|---|
| **Product name** | text | ≤45 字符 | ✓ | 关键词前置；通常 Autofill 会用原语言，需修改 |
| **Product URL** | URL | - | ✓ | 触发 Autofill 的来源 URL |
| **Tagline** | text | ≤60 字符 | ✓ | 一句话卖点 |
| **Category** | select | 最多 3 个 | ✓ | 固定列表选择 |
| **Pricing model** | select | Free/Freemium/Trial/Paid/LTD | ✓ | 根据实际选择 |
| **Collaborators** | tags | 最多 10 人 | - | 其他贡献者 |
| **Open source** | checkbox | - | - | 若是开源则勾 |
| **Built with** | tags | 最多 10，搜索下拉 | ✓ | 技术栈（Next.js、React 等） |
| **Description** | rich-text | ≤5000 字符 | ✓ | 完整描述，支持 Markdown |
| **Logo** | image | 500×500px, ≤15MB | ✓ | 正方形 |
| **Cover images** | images | 1200×630px, 3-4 张, ≤15MB 每张 | ✓ | 横幅；Autofill 常已生成 |
| **Demo Video URL** | URL | YouTube/Loom/Vimeo | - | 可选 |

---

<a id="karma"></a>
## Karma 系统

### Karma 获取与 Launch 流程（2026-09-11 实测）

**Karma 来源与数值**：

| 动作 | Karma | 备注 |
|---|---|---|
| Complete Profile | +5 | 需填 bio、photo、name、website，**还需添加社交媒体链接**（X、GitHub 等）才能触发 +5 里程碑 |
| Follow a maker | +2 | 关注任意一个 maker |
| Upvote a product | +2 | 给任意产品点赞 |
| Post a comment | +2 | 在任意产品下发评论 |
| Post a buildlog | +5 | 发布一篇 buildlog（类似开发日志） |
| **Launch 需要** | **10** | 或 $9 一次性 premium 购买 |

### 典型 grind 路线（从 0 到 launch）

1. 完善 Profile（填齐 bio/photo/name/website + 社交链接）→ claim +5
2. Follow 一个 maker → +2（累计 7）
3. Upvote 一个产品 → +2（累计 9）
4. 发一条 Comment → +2（累计 11，已够 launch）
5. 或者跳过 comment，发一篇 Buildlog → +5（累计 14）

### 关键限制

- **一个账号同一时间只能有一个 product draft**。每次 "Submit Product" 覆盖上一份草稿。
- 必须 Launch 当前产品（消耗 10 Karma 或 $9）后才能提交下一个。
- Free Launch 进入周排期队列（如 Week 42 = 10/12~10/18），近期几周可能已满。
- 产品详情页 launch 后立即公开可访问（Google/直链可见），但在排定周之前不出现在 Products 排行榜。

---

<a id="scripting"></a>
## 脚本化策略

### 单产品提交（使用 Autofill）

```bash
# 1. 导航到提交页
opencli browser <session> navigate https://builtbyindies.com/submit

# 2. 填入产品 URL 到 Autofill 输入框（id/class 待实测）
opencli browser <session> form_input <ref> <product-url>

# 3. 点击 Autofill 按钮
opencli browser <session> click <autofill-button-ref>

# 4. 等待 ~30s
sleep 30

# 5. 验证填充结果（特别检查产品名是否需要改回英文）
opencli browser <session> snapshot --to autofill-result.html

# 6. 编辑产品名（如需要）
opencli browser <session> form_input <name-field-ref> "English Product Name"

# 7. 上传 Logo 和 Cover（如未自动生成）
#    file input 可能需要特殊处理，见下

# 8. 提交
opencli browser <session> click <submit-button-ref>

# 9. 捕获重定向后的 product_id
opencli browser <session> snapshot --to upgrade-page.html
# 从 URL /upgrade?product_id=<uuid> 提取 uuid
```

### 多产品批量策略

**因单帐号单草稿限制，有三条路：**

#### 方案 A：Karma 轮转（同一帐号）

```
循环 3 次：
  1. Autofill + 提交产品 N（到 /upgrade）
  2. 选择免费发布（消耗 0 Karma，或 +5 若首发） → 发布
  3. 投票其他产品达 6 个 → 积累 +5 Karma
  4. 回到第 1 步，提交下一个产品
  
限制：慢（每个产品需要等待发布和投票），但成本 $0
```

#### 方案 B：多帐号（并行）

```
创建 3 个帐号，每个各提交一个产品：
  - user@email1.com → product 1
  - user@email2.com → product 2
  - user@email3.com → product 3

限制：需 3 个邮箱；初始化需验证；首次发布每个需 10 Karma 或 $9
```

#### 方案 C：混合（付费快速）

```
- 帐号 1：Autofill 产品 1 → $9 高级发布（instant dofollow）
- 帐号 2：Autofill 产品 2 → 投票积累 Karma 到 10 → 免费发布
- 帐号 1：回到 /submit → Autofill 产品 3 → $9 发布

成本：$18，速度最快（每个 1-2 分钟）
```

### 图片处理

**Logo：** 500×500px，正方形，通常 PNG

**Cover：** 1200×630px（16:9 横幅），3-4 张
- Autofill 常已生成（AI 合成或来源站提取）
- 若未生成，需本地上传或用图片生成服务

> **File input 填充很容易翻车。** 不同浏览器对 `<input type="file">` 的 value 设置有限制。
> 推荐做法：
> 1. 通过 Autofill 让 AI 生成图片（成功率 ≥70%）
> 2. 若失败，再手动上传或用外部接口生成

---

<a id="link-value"></a>
## 外链价值

| 发布方式 | Link 类型 | 产品 URL 格式 | 何时生效 |
|---|---|---|---|
| **免费发布** | nofollow | https://builtbyindies.com/products/`<slug>` | 发布即时 |
| **免费 + 投票前 3** | dofollow | 同上 | 投票达排名后 |
| **付费发布** | dofollow | 同上 | 发布即时 |

**品质信号：**
- Autofill 的描述通常质量不错（AI 改写）
- 产品页会被爬虫索引（sitemap 自动包含）
- 社区投票、comment 等社交信号会影响页面 PageRank

---

<a id="accounts"></a>
## 账户数据

| 属性 | 值 |
|---|---|
| **用户名** | user48 |
| **用户昵称** | 少侠 |
| **邮箱** | - |
| **注册日期** | 2026-09-11 |
| **Karma** | 0（初始） |
| **状态** | 可用，未发布产品 |

---

## 常见坑

1. **Autofill 后忘记改产品名** → 线上可能显示日文或不规范英文
2. **提交后忘记选择发布方式** → 停留在 /upgrade 页面，产品还在草稿
3. **快速连续提交多个产品** → 第二个覆盖第一个，第一个丢失
4. **Cover 图片尺寸错误** → 上传可能失败或显示变形
5. **直接在 /submit 刷新** → 丢失填好的表单，需要重新开始

## 脚本维护注意

- **会话管理：** 每个帐号用一个独立会话，避免 cookie 混淆
- **缓存管理：** Autofill 结果可缓存 24h，不用重复触发 AI 推理
- **Error handling：** file input 状态不稳定，上传后一定要截图验证
- **Rate limit：** 暂无已知限制，但建议每个操作间隔 1-2 秒
