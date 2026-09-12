# BetaList 提交工作流

以 betalist.com 为目标的产品提交、填表与多产品批量提交的脚本参考。

## 目录

- [平台概览](#overview)
- [关键限制：免费 vs 付费](#limitation)
- [认证与会话](#auth)
- [提交完整流程](#flow)
- [表单字段映射](#fields)
- [图片处理：DirectUpload](#images)
- [费用模型](#pricing)
- [脚本化策略](#scripting)
- [外链价值](#link-value)
- [提交记录](#submissions)

---

<a id="overview"></a>
## 平台概览

BetaList 是面向新产品测试者与早期用户的发布平台，具有活跃社区和高质量反馈机制。

| 项目 | 说明 |
|---|---|
| **域名** | https://betalist.com |
| **提交入口** | /submit（登录后可见） |
| **登录方式** | Google OAuth（不支持邮箱/密码） |
| **免费发布** | "Started" 状态，有限曝光 |
| **付费发布** | $99 一次性（立即进入 Review/Featured 队列） |
| **反链** | nofollow（免费）/ 可能 dofollow（付费） |

---

<a id="limitation"></a>
## 关键限制：免费 vs 付费

### 免费发布（"Started" 状态）

提交无费用，但产品进入 "Started" 状态：
- 产品页可被访问，但**不在主页和排序榜单中显示**
- 审核队列排名靠后（通常需要 1-4 周）
- 获得的反馈和投票有限
- 反链为 nofollow

### 付费发布（$99 一次性）

付费进入 "Review" 或 "Featured" 队列：
- 即时进入编辑审核和社区投票
- 登上 BetaList 主页或排行榜
- 更多社交信号和流量
- 反链可能升级为 dofollow（待确认）
- 一次性支付，无订阅费用

**批量提交成本考虑：**
- 3 产品全免费 = $0（但曝光有限）
- 3 产品全付费 = $297（快速曝光）
- 1 产品付费 + 2 产品免费 = $99（平衡方案）

---

<a id="auth"></a>
## 认证与会话

### 登录流程

1. 导航到 https://betalist.com
2. 点击登录按钮（通常右上角 "Sign in"）
3. 选择 "Sign in with Google"
4. 完成 Google OAuth 认证
5. 完成后重定向到个人面板或 /submit 页面

### 会话管理

- **Cookie 存储** — BetaList 使用 OAuth token 存储在 cookie 或 localStorage
- **会话刷新** — 通常 24 小时内有效，过期自动刷新
- **多会话隔离** — 不同 Google 账号 = 不同 BetaList 账号
- **注销** — 点击个人菜单的 "Sign out" 或清空 OAuth 认证

**脚本建议：** 每个 BetaList 账号对应一个唯一的 Google 账号和浏览器会话，避免混淆。

---

<a id="flow"></a>
## 提交完整流程

### 标准路径

```
1. 导航到 https://betalist.com
2. 点击登录，完成 Google OAuth
3. 导航到 /submit 页面（或个人菜单 → "Submit a product"）
4. 填写表单各字段（见下）
5. 上传 Icon/Logo（需使用 DirectUpload）
6. 点 "Submit" 或 "Save as Draft" 或相似按钮
7. 完成免费提交 → 产品进入 "Started" 状态
   或选择付费 → 输入信用卡，$99 一次性支付
8. 获得 Listing ID（如 #187490）
9. 邮件确认和产品 URL
```

### 表单填充注意事项

**产品名称（Name/Title）：**
- 英文，3-50 字符，清晰明快
- 避免通用词和冗长描述

**产品 URL：**
- 完整链接，带 https:// 或 http://
- 确保页面在线且可正常加载

**标签行（Tagline）：**
- 一句话卖点，通常 50-80 字符
- 类似 Product Hunt 的 tagline 格式

**描述（Description）：**
- 完整的产品说明，3-5 段，支持 Markdown
- 解释核心功能、痛点解决、使用场景
- 审核员和用户都会读这部分

**分类（Category）：**
- 下拉选择或标签，选择最贴切的主分类
- 常见分类：AI、设计、开发工具、SaaS、浏览器扩展等

**Icon/Logo：**
- 方形图片（推荐 512×512px 或 1024×1024px）
- PNG 或 JPEG，通常 <5MB
- 使用 Rails DirectUpload 上传（见下方图片处理）

---

<a id="fields"></a>
## 表单字段映射

| 字段 | 类型 | 约束 | 必填 | 说明 |
|---|---|---|---|---|
| **Product Name** | text | 3-50 字符 | ✓ | 英文产品名，清晰有力 |
| **Product URL** | URL | 有效链接 | ✓ | 完整 URL，必须在线 |
| **Tagline** | text | 50-80 字符 | ✓ | 一句话卖点 |
| **Description** | rich-text | 支持 Markdown | ✓ | 完整功能和价值描述 |
| **Category** | select/tags | 固定列表 | ✓ | 主分类，单选或多选 |
| **Icon** | image | 512×512px 或以上 | ✓ | 方形，PNG/JPEG，<5MB |
| **Website** | URL | 可选 | - | 公司/创意者主页 |
| **Twitter** | text | @username | - | Twitter 账号（可选） |
| **Email** | email | 验证过 | ✓ | 产品团队联系邮箱 |

---

<a id="images"></a>
## 图片处理：DirectUpload

BetaList 使用 Rails 框架的 **ActiveStorage DirectUpload** 功能，允许浏览器直接上传到存储后端（通常 AWS S3 或类似）。

### DirectUpload 流程

1. **获取上传授权** — 前端向后端请求临时上传 token
2. **直接上传** — 浏览器向存储服务发起 CORS POST
3. **确认上传** — 上传完成后向后端通知 blob ID
4. **绑定字段** — 表单提交时关联 blob ID 到产品字段

### 脚本化上传

```javascript
// 示例：使用 Rails DirectUpload API 上传 Icon
// 这是后端暴露的标准接口

// 1. 读取本地图片文件
const fileInput = document.querySelector('input[type="file"][id*="icon"]');
const file = fileInput.files[0]; // PNG/JPEG

// 2. 获取 DirectUpload 授权
const response = await fetch('/rails/active_storage/direct_uploads', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content,
  },
  body: JSON.stringify({
    blob: {
      filename: file.name,
      byte_size: file.size,
      checksum: await calculateChecksum(file),
      content_type: file.type,
    },
  }),
});

const { id, upload_url, headers } = await response.json();

// 3. 直接上传到 S3（或其他存储）
const uploadResponse = await fetch(upload_url, {
  method: 'PUT',
  headers,
  body: file,
});

// 4. 创建输入字段，绑定 blob id
const hiddenInput = document.createElement('input');
hiddenInput.type = 'hidden';
hiddenInput.name = 'product[icon]';
hiddenInput.value = id;
document.querySelector('form').appendChild(hiddenInput);
```

### 脚本上传建议

**推荐工具链：**

1. 使用 `opencli browser` + JavaScript 直接调用 DirectUpload API
2. 或用本地脚本预上传图片到 S3，得到 URL，再填入表单
3. 若上传失败，通常提示 CORS 错误或 token 过期——重新获取 token 后重试

**常见错误：**

- CORS 错误：确认浏览器已登录、Cookie 包含认证信息
- Token 过期：DirectUpload token 有效期约 24h，若跨天提交需刷新
- 文件格式：非 PNG/JPEG 可能被拒，或需转换

---

<a id="pricing"></a>
## 费用模型

| 方案 | 初始成本 | 状态 | 曝光程度 | 反链 |
|---|---|---|---|---|
| **免费** | $0 | "Started" | 低（不在主页） | nofollow |
| **付费** | $99 | "Review" / "Featured" | 高（主页、排行榜） | nofollow 或 dofollow* |
| **企业合作** | 个案 | 定制 | 优先 | 可协议 |

*反链属性（dofollow vs nofollow）付费后待核验，暂按 nofollow 保守计算。

**批量成本计算：**

```
3 产品全免费 = $0（但曝光有限，列表可能需 1-4 周）
1 产品付费 = $99（快速上线主页）
3 产品混合（1 付费 + 2 免费） = $99（平衡方案）
3 产品全付费 = $297（全部快速曝光）
```

---

<a id="scripting"></a>
## 脚本化策略

### 单产品提交

```bash
# 1. 使用 Google OAuth 登录
# （需手动或用特殊工具处理 OAuth 认证）
opencli browser <session> navigate https://betalist.com
opencli browser <session> click <sign-in-button>
# ... 完成 Google OAuth 流程 ...

# 2. 导航到提交页
opencli browser <session> navigate https://betalist.com/submit

# 3. 填写基本信息
opencli browser <session> form_input <name-ref> "Your Product Name"
opencli browser <session> form_input <url-ref> "https://yourproduct.com"
opencli browser <session> form_input <tagline-ref> "Short description"

# 4. 填写分类
opencli browser <session> form_input <category-ref> "AI Tools"

# 5. 填写描述
opencli browser <session> form_input <description-ref> "Your full description..."

# 6. 上传 Icon（需通过 DirectUpload API）
# 方法 A：手动文件上传
opencli browser <session> click <icon-upload-input>
# ... 选择本地图片文件 ...

# 方法 B：脚本 DirectUpload
# 先创建临时图片文件，再执行脚本上传
opencli browser <session> javascript_tool << 'SCRIPT'
  // DirectUpload 脚本（见上方详细代码）
  // 上传完成后返回 blob id
  return blobId;
SCRIPT

# 7. 提交表单（免费方案）
opencli browser <session> click <submit-free-button>

# 或选择付费（需输入信用卡）
opencli browser <session> click <submit-paid-button>
# opencli browser <session> form_input <card-ref> "4111111111111111"
# （实际信用卡细节通常不脚本化，手动输入）

# 8. 等待提交完成
sleep 3

# 9. 捕获确认页，提取 Listing ID
opencli browser <session> snapshot --to listing-confirmed.html
# 从页面中提取 ID（如 "#187490"）
```

### 多产品批量提交

**因 BetaList 允许多个产品提交，批量策略较灵活：**

#### 方案 A：顺序提交（同一账号）

```bash
# 循环提交 N 个产品
PRODUCTS=("product1" "product2" "product3")

for product in "${PRODUCTS[@]}"; do
  # 导航到提交页
  opencli browser <session> navigate https://betalist.com/submit
  sleep 2
  
  # 填表（关键字段）
  opencli browser <session> form_input <name-ref> "$product"
  opencli browser <session> form_input <url-ref> "https://$product.com"
  opencli browser <session> form_input <tagline-ref> "Tagline for $product"
  opencli browser <session> form_input <description-ref> "Description for $product"
  opencli browser <session> form_input <category-ref> "AI Tools"
  
  # 上传 Icon
  # （使用 DirectUpload 或手动）
  
  # 选择免费或付费提交
  if [[ "$product" == "product1" ]]; then
    # 第一个产品付费
    opencli browser <session> click <submit-paid-button>
    # ... 手动输入信用卡（暂不脚本化）
  else
    # 其他产品免费
    opencli browser <session> click <submit-free-button>
  fi
  
  sleep 3
  
  # 记录 ID
  opencli browser <session> snapshot --to listing-${product}.html
  
  # 等待页面稳定再进行下一个
  sleep 2
done
```

#### 方案 B：并行提交（多账号）

```bash
# 创建 3 个 Google 账号，各自独立提交一个产品
# 每个账号对应一个浏览器会话

for i in {1..3}; do
  (
    SESSION="betalist_session_$i"
    PRODUCT="product$i"
    
    # 各会话独立登录
    opencli browser $SESSION navigate https://betalist.com
    opencli browser $SESSION click <sign-in-button>
    # ... OAuth 认证流程 ...
    
    # 填表和提交
    opencli browser $SESSION navigate https://betalist.com/submit
    opencli browser $SESSION form_input <name-ref> "$PRODUCT"
    # ... 其他字段 ...
    opencli browser $SESSION click <submit-button>
    
    sleep 3
    opencli browser $SESSION snapshot --to listing-${PRODUCT}.html
  ) &
done

wait  # 等待所有后台进程完成
```

#### 方案 C：混合（付费加速）

```bash
# 第一个产品付费（$99 快速曝光）
# 其他产品免费（后续批量投票）

PRODUCTS=("priority_product" "standard_product1" "standard_product2")

for i in "${!PRODUCTS[@]}"; do
  product="${PRODUCTS[$i]}"
  
  opencli browser <session> navigate https://betalist.com/submit
  sleep 2
  
  # ... 填表 ...
  
  if [[ $i -eq 0 ]]; then
    # 第一个产品付费
    echo "提交付费版本：$product"
    opencli browser <session> click <submit-paid-button>
    # 手动或其他方式处理信用卡输入
  else
    # 其他产品免费
    echo "提交免费版本：$product"
    opencli browser <session> click <submit-free-button>
  fi
  
  sleep 3
  sleep 2
done
```

### Google OAuth 自动化

Google OAuth 通常需要手动交互（二因素认证等），脚本化难度高。**建议方案：**

1. **预存 session cookie** — 第一次手动登录后，导出 cookie 保存
2. **重用 cookie** — 后续脚本化提交前，注入已保存的 cookie
3. **多会话隔离** — 若需多账号，各用一套 Google 账号和预存 cookie

```bash
# 导出 cookie（首次登录后）
opencli browser <session> javascript_tool 'document.cookie'

# 存储 cookie 到文件或环境变量
# 后续提交前重新注入 cookie
```

---

<a id="link-value"></a>
## 外链价值

| 属性 | 值 | 说明 |
|---|---|---|
| **链接类型** | nofollow（免费）/ dofollow*（付费？） | 当前策略待确认 |
| **产品 URL 格式** | https://betalist.com/products/`<slug>` | 审核通过后的链接 |
| **索引状态** | 通常被爬虫索引 | 活跃社区平台，页面曝光好 |
| **品质信号** | 中→高 | 社区评分、反馈评论等社交信号 |
| **反向链接品质** | 中等 | DA/PA 取决于 BetaList 整体权重 |

*付费后是否升级为 dofollow 待确认。当前按 nofollow 保守计算。

**建议：** BetaList 主要价值在**社区反馈、品牌曝光、用户转化**，而非 SEO 权重。免费提交适合初期曝光，付费适合需要快速上线主页时。

---

<a id="submissions"></a>
## 提交记录

| 产品 | Listing ID | 邮箱 | 日期 | 状态 | 方案 |
|---|---|---|---|---|---|
| intabtools | #187490 | - | 2026-09-11 | 已提交 | 免费 |
| shindan | #187491 | - | 2026-09-11 | 已提交 | 免费 |
| videocatch | #187492 | - | 2026-09-11 | 已提交 | 免费 |

---

## 常见坑

1. **OAuth 认证失败** — Google 账号的两步验证可能阻断脚本登录，需手动处理首次认证
2. **DirectUpload 超时** — 网络慢或图片过大可能导致 token 过期，需重新获取
3. **Icon 格式错误** — 非 PNG/JPEG 或尺寸过小可能被拒，提前验证
4. **描述内容不完整** — 审核员可能拒绝过于简短的描述，建议 3-5 段
5. **免费产品曝光延迟** — "Started" 状态可能需 1-4 周才显示在排行，耐心等待
6. **付费后信用卡拒付** — 确保卡有有效期、余额充足、非国内卡（BetaList 可能不支持某些发卡行）
7. **重复提交同一产品** — 可能被标记为重复或垃圾，建议检查是否已存在

## 脚本维护注意

- **认证管理** — 预存 OAuth session，避免每次重新认证；多账号用不同 Google 账号
- **DirectUpload 稳定性** — 图片上传易出错，脚本需异常重试机制
- **字段验证** — 提交前检查所有必填字段非空，避免提交失败
- **速率限制** — 未知具体限制，建议单个提交间隔 2-3 秒
- **状态轮询** — 免费产品审核可能需数天，定期检查邮箱和产品页状态

---

## 后续跟踪

### 免费提交（"Started"）

1. 等待 1-4 周审核
2. 检查邮箱通知和 /account/listings 页面
3. 若审核通过，产品会进入 "Review" 或主页排行
4. 社区投票和反馈开始

### 付费提交（$99）

1. 提交后即刻进入 "Review" 或 "Featured" 队列
2. 产品快速上线主页和排行榜
3. 接收社区投票和反馈评论
4. 可在后台管理产品信息和回复反馈

---

## 相关资源

- [BetaList 主页](https://betalist.com)
- [OpenCLI 浏览器自动化文档](./opencli-browser.md)
- [Rails ActiveStorage DirectUpload](https://guides.rubyonrails.org/active_storage_overview.html#direct-uploads)
