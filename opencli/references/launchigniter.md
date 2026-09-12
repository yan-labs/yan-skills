# LaunchIgniter 提交工作流

以 launchingnext.com 为目标的产品提交、填表与多产品批量提交的脚本参考。

## 目录

- [平台概览](#overview)
- [关键特性](#key-features)
- [提交完整流程](#flow)
- [表单字段映射](#fields)
- [验证码处理](#captcha)
- [费用模型](#pricing)
- [脚本化策略](#scripting)
- [外链价值](#link-value)
- [提交记录](#submissions)

---

<a id="overview"></a>
## 平台概览

LaunchIgniter（运营域名 launchingnext.com）是新产品发布社区平台。

| 项目 | 说明 |
|---|---|
| **域名** | https://www.launchingnext.com |
| **提交入口** | /submit/ |
| **登录要求** | 无（匿名可提交） |
| **免费发布** | 完全免费，无隐藏费用 |
| **审核周期** | 3-7 天 |
| **反链** | nofollow（待核验付费升级） |

---

<a id="key-features"></a>
## 关键特性

1. **无账户系统** — 完全匿名提交，无需登录或注册
2. **一次性表单** — 无草稿保存，提交后即进入审核队列
3. **算术验证码** — 防止机器提交（如 "5 + 7 = ?" 需填 12）
4. **提交确认 ID** — 提交成功后返回唯一 ID（如 #150115），用于跟踪审核状态
5. **无单产品限制** — 同一邮箱可连续提交多个不同产品

---

<a id="flow"></a>
## 提交完整流程

### 标准路径

```
1. 导航到 https://www.launchingnext.com/submit/
2. 填写表单各字段（见下）
3. 解算术验证码，填入答案
4. 点 "Submit" 或相似提交按钮
5. 重定向至确认页面，显示提交 ID（如 "Your submission #150115"）
6. 记录提交 ID 用于后续跟踪
```

### 表单填充注意事项

**产品名称（Name）：**
- 必须是英文，清晰易懂
- 建议 3-50 字符，简短有力
- 避免通用词（"App"、"Tool"）

**产品 URL：**
- 完整可访问的链接（带 protocol https:// 或 http://）
- 确保不返回 404 或重定向错误

**短描述（Short Description）：**
- 一句话卖点，20-100 字符
- 直接说明核心功能或价值

**分类（Category）：**
- 下拉选择，选项固定
- 常见分类：AI、工具、SaaS、浏览器扩展、移动应用、设计、开发工具等
- 选择最贴切的主分类，避免多选

**邮箱（Email）：**
- 接收审核反馈和链接的联系方式
- 允许多次提交用同一邮箱

---

<a id="fields"></a>
## 表单字段映射

| 字段 | 类型 | 约束 | 必填 | 说明 |
|---|---|---|---|---|
| **Product Name** | text | 3-50 字符 | ✓ | 英文产品名，避免原语言或冗长 |
| **Product URL** | URL | 有效链接 | ✓ | 必须能直接访问，不含错误 |
| **Short Description** | text | 20-100 字符 | ✓ | 一句话卖点，清晰表达核心价值 |
| **Category** | select | 固定列表 | ✓ | 下拉选择，单选 |
| **Email** | email | 标准格式 | ✓ | 用于接收审核反馈 |
| **Verification Code** | number | 两数相加 | ✓ | 算术验证码答案（如 5+7=12） |

---

<a id="captcha"></a>
## 验证码处理

LaunchIgniter 使用简单算术验证码防止自动提交。

**示例：**
```
请计算: 8 + 3 = ?
答案填 11
```

**脚本处理建议：**

1. **捕获验证码文本** — 从页面截取验证码题目
2. **正则提取数字** — 使用 `/(\d+)\s*\+\s*(\d+)/` 匹配
3. **简单计算** — JavaScript 内 eval 或 parseInt 计算和
4. **填入结果** — 写入验证码 input

```javascript
// 示例：从 DOM 中获取验证码题目
const captchaText = document.querySelector('.captcha-question').innerText;
// 匹配 "5 + 7"
const match = captchaText.match(/(\d+)\s*\+\s*(\d+)/);
if (match) {
  const answer = parseInt(match[1]) + parseInt(match[2]);
  document.querySelector('input[name="captcha"]').value = answer;
}
```

---

<a id="pricing"></a>
## 费用模型

| 项目 | 费用 | 说明 |
|---|---|---|
| **基础提交** | 免费 | 提交即进入免费审核队列 |
| **审核期限** | - | 3-7 天内通过或驳回 |
| **付费加速** | 未知 | 可能存在付费选项（待实测） |
| **反链属性** | nofollow | 当前策略（若升级 SEO 价值需确认） |

**成本最低**：完全免费提交，无任何隐藏费用。

---

<a id="scripting"></a>
## 脚本化策略

### 单产品提交

```bash
# 1. 导航到提交页
opencli browser <session> navigate https://www.launchingnext.com/submit/

# 2. 填写产品名
opencli browser <session> form_input <name-field-ref> "Your Product Name"

# 3. 填写产品 URL
opencli browser <session> form_input <url-field-ref> "https://yourproduct.com"

# 4. 填写短描述
opencli browser <session> form_input <description-field-ref> "One-sentence product tagline"

# 5. 选择分类
opencli browser <session> form_input <category-select-ref> "AI Tools"

# 6. 填写邮箱
opencli browser <session> form_input <email-field-ref> "contact@example.com"

# 7. 捕获验证码题目
opencli browser <session> snapshot --to captcha-check.html

# 8. 解算术验证码并填入答案
# （从快照中提取题目，如 "8 + 3 = ?"，计算答案 11）
opencli browser <session> form_input <captcha-field-ref> "11"

# 9. 提交表单
opencli browser <session> click <submit-button-ref>

# 10. 等待重定向（通常 <2 秒）
sleep 2

# 11. 捕获确认页面，提取提交 ID
opencli browser <session> snapshot --to submission-confirmed.html
# 从页面中提取 ID（如 "#150115"）
```

### 多产品批量提交

**因 LaunchIgniter 无单产品限制，批量策略较简洁：**

#### 方案 A：逐个提交（顺序）

```bash
# 循环提交 N 个产品
for product in product1 product2 product3; do
  # 导航
  opencli browser <session> navigate https://www.launchingnext.com/submit/
  
  # 填表（自动化或手动）
  opencli browser <session> form_input <name-ref> "$product"
  opencli browser <session> form_input <url-ref> "https://$product.com"
  opencli browser <session> form_input <description-ref> "Description for $product"
  opencli browser <session> form_input <category-ref> "AI Tools"
  opencli browser <session> form_input <email-ref> "contact@example.com"
  
  # 验证码
  opencli browser <session> snapshot --to captcha-$product.html
  # 手动解题或脚本提取答案
  opencli browser <session> form_input <captcha-ref> "ANSWER"
  
  # 提交
  opencli browser <session> click <submit-ref>
  sleep 2
  
  # 记录 ID
  opencli browser <session> snapshot --to confirmation-$product.html
  
  # 等待 1 秒后进行下一个
  sleep 1
done
```

#### 方案 B：并行提交（多会话）

```bash
# 创建多个浏览器会话，各自同时提交
opencli browser session1 navigate https://www.launchingnext.com/submit/
opencli browser session2 navigate https://www.launchingnext.com/submit/
opencli browser session3 navigate https://www.launchingnext.com/submit/

# 各会话同时填表
opencli browser session1 form_input <name-ref> "Product 1"
opencli browser session2 form_input <name-ref> "Product 2"
opencli browser session3 form_input <name-ref> "Product 3"

# ... 类似步骤完成各字段 ...

# 同时提交
opencli browser session1 click <submit-ref>
opencli browser session2 click <submit-ref>
opencli browser session3 click <submit-ref>
```

### 验证码自动化建议

```javascript
// 自动提取和计算验证码答案
function solveCapcha() {
  const captchaLabel = document.body.innerText;
  
  // 尝试匹配 "X + Y" 模式
  const match = captchaLabel.match(/(\d+)\s*\+\s*(\d+)/);
  if (match) {
    const sum = parseInt(match[1]) + parseInt(match[2]);
    const captchaInput = document.querySelector('input[name="captcha"], input[type="number"]');
    if (captchaInput) {
      captchaInput.value = sum;
      return true;
    }
  }
  return false;
}

solveCapcha();
```

---

<a id="link-value"></a>
## 外链价值

| 属性 | 值 | 说明 |
|---|---|---|
| **链接类型** | nofollow | 当前策略（无 SEO 权重）|
| **产品 URL 格式** | https://www.launchingnext.com/launches/`<id>` | 审核通过后的链接 |
| **索引状态** | 通常被爬虫索引 | 社区平台，多数页面可被爬 |
| **品质信号** | 中等 | 新产品发布社区，有社交信号但权重有限 |
| **反向链接品质** | 低→中 | 免费平台，品质取决于其 DA/PA |

**建议：** 将 LaunchIgniter 视为**品牌曝光与社区参与的渠道**，而非主要外链来源。dofollow 可能需付费升级；当前免费链接价值主要体现在社交信号与点击流量。

---

<a id="submissions"></a>
## 提交记录

| 产品 | 提交 ID | 邮箱 | 日期 | 状态 |
|---|---|---|---|---|
| intabtools | #150115 | - | 2026-09-11 | 已提交 |
| shindan | #150118 | - | 2026-09-11 | 已提交 |
| videocatch | #150119 | - | 2026-09-11 | 已提交 |

---

## 常见坑

1. **验证码答案错误** → 提交失败，需返回重新计算
2. **产品 URL 不可访问** → 审核可能被驳回，确保站点在线
3. **原语言产品名** → 不符合英语要求，可能被驳回
4. **邮箱无效** → 审核反馈无法送达，建议使用真实邮箱
5. **分类不匹配** → 选错分类可能降低产品曝光度
6. **重复提交同一产品** → 可能导致重复收录或冲突

## 脚本维护注意

- **会话隔离** — 虽无账户限制，但建议用独立会话避免 cookie 混淆
- **验证码解析** — 算术验证码易解，但格式可能变化，脚本需容错
- **URL 有效性检测** — 提交前可先 curl/GET 验证目标 URL 返回 200
- **邮箱收集** — 用真实邮箱接收反馈，便于追踪审核进度
- **Rate limit** — 未知限制，建议单个提交间隔 1-2 秒
- **重定向捕获** — 确认页通常包含提交 ID，脚本需正确解析

---

## 后续跟踪

提交后 3-7 天内：

1. 检查邮箱确认审核状态
2. 访问 LaunchIgniter 主页搜索产品名，确认上线
3. 验证产品页链接正确指向目标 URL
4. 可在社区手动投票，增加曝光

---

## 相关资源

- [LaunchIgniter 主页](https://www.launchingnext.com)
- [OpenCLI 浏览器自动化文档](./opencli-browser.md)
