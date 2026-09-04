# 数据分析平台接入：GA4 · Clarity · Firebase · Ahrefs

段 4 末到段 5 的子环节。与 [`search-platforms.md`](search-platforms.md) 平行：
搜索平台管「搜索引擎怎么看你」，分析平台管「用户怎么用你、外链怎么指向你」。
同样是**每建一个站都要原样做一遍**，本文档记录操作步骤和自动化脚本。

## 先看这张顺序表

| 顺序 | 做什么 | 依赖 | 自动化程度 |
|---|---|---|---|
| 0 | **GA4 建媒体资源 + 拿 Measurement ID + 注入** | Google 账号 | 手动（控制台向导 → gtag 或 Zaraz 注入 → 线上 grep + 实时报告验证） |
| 1 | **Microsoft Clarity 创建项目 + 埋追踪代码** | 微软账号 | 半自动（`clarity-setup.mjs create` 拿 ID → 手动把代码写进 `<head>`） |
| 2 | **Firebase 创建项目 + 添加 Web 应用** | Google 账号 | 半自动（`firebase` CLI 或控制台 UI → 手动把 config 写进代码） |
| 3 | **Ahrefs 创建项目 + 所有权验证** | Ahrefs 账号 | 半自动（`ahrefs-setup.mjs create` → `verify` 通过 GSC 自动验证） |
| 4 | **Ahrefs Web Analytics 启用 + 埋追踪脚本** | 步骤 3 完成 | 半自动（`ahrefs-setup.mjs enable-wa` 拿 data-key → 手动把脚本写进 `<head>`） |

**脚本采集留证，判读归 AI（2026-08-30 双证人化，截图链路已实盘验证）**：
`clarity-setup.mjs` 与 `ahrefs-setup.mjs` 的向导每一步都截图落
`.rankup/evidence/<script>-<ts>/`，失败退出前现场（截图+页面文本+manifest 的
stopReason）必已落盘。它们**不再宣布「✅ 创建成功」**：create 只报告「流程走完、
从 URL/页面提取到 ID/data-key」这些事实——URL 命中 ≠ 创建成功，最终以
create-final / enable-wa-final 那张截图为准。空结果或报错先看 manifest，
不要读成「项目不存在」。

## 0. GA4（域名无关，可在预览域先接）

### 它属于哪一批

段 5 的接入分两批：**批 A 域名无关**（GA4、Clarity、Cloudflare Web Analytics）在预览域（noindex）
就接好并验证；批 B 域名相关（GSC、Bing、IndexNow、Ahrefs 站长版）等域名定稿后再做。
GA4 在批 A：媒体资源的数据流 URL 只是展示用途，换域名不用重建，改一下数据流的网址即可。
所以**不要等域名定稿才接 GA4**，那会让上线当天少一份基线。

### 接入步骤

1. **建媒体资源**：GA 控制台 → 管理 → 创建媒体资源（选 GA4，不是旧版 UA），时区与币种按目标市场填，
   不按你所在地填——报表的「昨天」按这个时区切。
2. **建网站数据流**：填当前可访问的 URL（预览域也可以），拿到 **Measurement ID**（形如 `G-XXXXXXXXXX`）。
   这是公开值，会出现在页面 HTML 里，不是秘密；但**逐站不同，记到 `<project>/.rankup/integrations.md`**。
3. **注入**（gtag 或 Zaraz 二选一）：
   - **gtag 一律延迟加载，禁止同步注入**。用 `requestIdleCallback`（不支持的浏览器回退
     `setTimeout 3500ms`）在主线程空闲时动态插入 `gtag.js`。GA4 采集的是会话级数据，
     晚几秒加载不丢任何数据，LCP 完全不受影响。snippet 里
     `function gtag(){dataLayer.push(arguments)}` 那个 `arguments` 是契约，别改写成箭头函数
     （同文件「第三方 snippet 里写法很旧的地方，往往是契约」）。
     **「GA 脚本拖 LCP」不是推迟接入 GA4 的理由——延迟加载就完了，以后不要再因为这个
     把 GA4 标 ❌。**【实测 2026-09-03】
   - **Cloudflare Zaraz**：站点已在 Cloudflare 上时，Zaraz → 添加工具 → Google Analytics 4 → 填 Measurement ID。
     仓库零代码，埋点由边缘注入；代价是不受你的同意门槛管辖、字节要照记
     （同文件「边缘注入型的分析」）。同意门槛做在站内的选 gtag，站内没有同意条的选 Zaraz。
4. **验证，两条都要**：
   - 线上 HTML 里 `curl -s <url> | grep -o 'G-[A-Z0-9]\{6,\}'` 得到你的 ID（Zaraz 注入的看资源列表，不看仓库产物）；
   - GA 实时报告里看到**这一次访问的会话**——清 cookie 重载、点同意、等几秒，实时用户数从 0 变 1。
   脚本加载了不算接通，实时报告有会话才算（同文件「不要用脚本加载了吗当接通的判据」）。
5. **回写**：Measurement ID、注入方式、验证日期写进 `<project>/.rankup/integrations.md`，
   并在隐私页点名 GA4——先改隐私声明再注入，顺序不能反。

### 与 Firebase 的关系

Firebase 项目可以关联这个 GA4 媒体资源（下一节），但纯 Web 站不需要为了 GA4 先建 Firebase；
先接 GA4，Firebase 只在要用它的 SDK 功能时再建。

## 1. Microsoft Clarity

### 它是什么

免费的会话录制和热力图工具。GA4 能告诉你「哪些页面跳出率高」，
Clarity 能告诉你「用户到底在那个页面上做了什么」——鼠标轨迹、滚动深度、
愤怒点击（连续点同一个地方却没有响应）。两者并走，不是替代关系。

### 追踪代码

```html
<script>
(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "<PROJECT_ID>");
</script>
```

`<PROJECT_ID>` 替换为 Clarity 控制台分配的值（形如 `xzmumryb8r`）。
这是公开值，会出现在页面 HTML 里，不是秘密。

### 自动化

```bash
# 查看当前账号下所有项目
node <rankup-skill-dir>/scripts/clarity-setup.mjs status

# 创建新项目并拿到追踪 ID
node <rankup-skill-dir>/scripts/clarity-setup.mjs create --site example.com --name mysite
```


## 2. Firebase

### 它是什么

Google 的应用开发平台。在 Rankup 的语境下主要用三件事：
1. **GA4 关联**——Firebase 项目关联 GA4 property，一个控制台看行为+事件数据
2. **Crashlytics / Performance Monitoring**——如果上了原生 SDK 才用得上，纯 Web 暂不涉及
3. **Remote Config / A/B Testing**——灰度实验框架，需要 SDK 支持

对纯 SSR 站（TanStack Start + Cloudflare Workers），GA4 已经独立埋好了，
Firebase 项目的主要价值是**把 GA4 property 归口到同一个 Google 账号下管理**，
以及为将来的 SDK 功能预留位置。

### 怎么做

推荐用 Firebase CLI（`npm install -g firebase-tools`）：

```bash
# 登录（只需一次）
firebase login

# 创建项目（--id 如果被占用会报错，换一个）
firebase projects:create --display-name "example" --id example-com

# 列出项目
firebase projects:list

# 添加 Web 应用（返回 config JSON）
firebase apps:create web "example" --project example-com
firebase apps:sdkconfig web --project example-com
```

也可以走控制台 UI：`console.firebase.google.com` → 创建项目 → 添加应用 → Web `</>` → 复制 config。


## 3. Ahrefs

### 它是什么

SEO 工具，核心能力是反向链接分析。在 Rankup 里用它：
1. **Site Explorer**——看竞品的外链从哪来、用什么锚文本、DR/UR 变化趋势
2. **Site Audit**——技术 SEO 健康检查（需验证所有权才能启动）
3. **排名跟踪器**——监控目标关键词的 SERP 排名变化
4. **Backlink 监控**——新增/丢失外链通知

与 `backlink` Skill 的关系：`backlink` Skill 驱动 Ahrefs 做盘点和执行，
Rankup 负责项目初始化和维持监控覆盖。

### 两条路：GSC 导入（优先）与手动创建

**路径 A（优先）：从 GSC 导入。** 如果 GSC 已验证该站点，用 Ahrefs Dashboard 的
「Import from GSC」一步完成创建 + 验证 + Site Audit 启用。这是最快路径：
不需要单独创建项目、不需要单独验证所有权、不需要手动开 Site Audit。
操作：Ahrefs Dashboard → 右上角「+Add」或空状态的 Import → 选择 Google 账号授权 →
在站点列表中**只勾选目标站点**（默认全选，务必取消其余的）→ 确认导入。
导入完成后项目立刻 active，Site Audit 默认启用。
**注意**：导入授予 Ahrefs 对 GSC 数据的长期 OAuth 读取权限——与 Bing 导入 GSC 同理，
用户须知晓这一点。不想授权就走路径 B。【实测 2026-09-03】

**路径 B：手动创建 + 验证。** 脚本走这条路：

```bash
# 查看 Dashboard 上的项目列表
node <rankup-skill-dir>/scripts/ahrefs-setup.mjs status

# 创建新项目（所有权验证可稍后补）
node <rankup-skill-dir>/scripts/ahrefs-setup.mjs create --site example.com --name mysite

# 通过 GSC 验证所有权（需浏览器已登录 Google 且 GSC 拥有该站点）
node <rankup-skill-dir>/scripts/ahrefs-setup.mjs verify --site example.com

# 启用 Web Analytics（Dashboard「总访问量」监控）并获取追踪脚本
node <rankup-skill-dir>/scripts/ahrefs-setup.mjs enable-wa --site example.com

# 如果已知项目 ID（见 .rankup/integrations.md），可直接指定以跳过 Dashboard 查找
node <rankup-skill-dir>/scripts/ahrefs-setup.mjs enable-wa --site example.com --project-id 12345678
```

### 所有权验证（路径 B）

项目创建后处于「冻结」状态。验证方式（任选一种）：

| 方式 | 操作 | 推荐场景 |
|---|---|---|
| DNS TXT 记录 | 在 Cloudflare DNS 添加 Ahrefs 指定的 TXT 记录 | 站点由 Cloudflare 管理（可 API 自动化） |
| HTML 标签 | 在 `<head>` 添加 `<meta name="ahrefs-site-verification" content="...">` | 代码能快速部署时 |
| HTML 文件 | 在根目录放置验证文件 | Workers 站点不方便（需要额外路由） |
| Google Search Console | 连接 Google 账号自动验证 | GSC 已接入且愿意授权 Ahrefs 读 GSC 数据 |


### Web Analytics（总访问量监控）

Ahrefs 自有的流量追踪脚本，独立于 GA4。Dashboard「总访问量」列需要它才会显示数据。

追踪脚本（**一律延迟加载，与 GA4 同理**）：

```html
<!-- 同步版（Ahrefs 官方文档给的，不要用） -->
<script async src="https://analytics.ahrefs.com/analytics.js" data-key="<DATA_KEY>"></script>

<!-- 延迟版（实际使用这个，requestIdleCallback 回退 setTimeout） -->
<script>
(function(){var f=function(){var s=document.createElement('script');
s.async=1;s.src='https://analytics.ahrefs.com/analytics.js';
s.dataset.key='<DATA_KEY>';document.head.appendChild(s)};
typeof requestIdleCallback==='function'?requestIdleCallback(f):setTimeout(f,3500)})();
</script>
```

`<DATA_KEY>` 由 `enable-wa` 命令输出。这是公开值。
延迟加载对 WA 数据采集没有影响（会话级数据，晚几秒不丢），LCP 零影响。
**验证**：部署后在 Ahrefs Web Analytics 设置页点「Recheck installation」，
看到「Script installed」即可——`curl` grep 只证代码在，不证数据流向正确。【实测 2026-09-03】

> **键必须与目标项目逐字核对，别的项目的键不会报任何错。**
> 实测过一次事故：站点埋的 `data-key` 属于同账号下的另一个项目。
> 表现是——HTML 里有 script（绿）、真实浏览器里请求确实发出（绿）、
> 接口不报错，**数据只是流进了别人的面板**。两个最常用的验证手段全部失效。
> 唯一有效判据：打开该项目的 **Web Analytics 设置页**，把上面显示的键和
> 代码里的字符串**逐字比对**。
>
> 另有一个同源陷阱：判断某项目「有没有启用 Web Analytics」时，
> 不要看别的项目的 Web Analytics 项目切换器——**那个下拉框只列已有数据的项目**，
> 没数据的新项目不会出现，看起来就像「这个项目不存在」。
> 要去**账号级的项目总览**确认。

> **TanStack Start 注意**：`head()` 的 `scripts` 数组不渲染 `data-*` 属性，
> 需要在 `RootDocument` 的 JSX `<head>` 中直接写 `<script>` 标签。


## 各站的实际取值放哪里（不要写回本文档）

Project ID、measurementId、appId、`data-key`、埋码位置——这些**逐站不同**，
属于项目侧资产，一律记在 `<project>/.rankup/integrations.md`，
**不进本 Skill**。本 Skill 由 `scripts/validate-rankup.mjs` 断言项目中立，
把站点清单写回这里会直接让门禁失败。

这条不只是洁癖。本文档一度维护过一张跨站的 `data-key` 清单，
而其中一行记的是**错误的键**——那枚键属于另一个项目。
错误的键在两个常用判据下和正确的键完全一样（HTML 里有 script、
浏览器里请求确实发出），于是这个错误值被当成事实沿用，
并且会被下一个建站的人照抄。**清单放在离事实最近的地方，才有人去修它。**

## 新站接入清单

每建一个新站，按此清单依次执行：

```
□ 0. GA4：控制台建媒体资源 → 拿 Measurement ID → gtag / Zaraz 注入 → 线上 grep 到 G- ID + 实时报告有会话（预览域即可）
□ 1. Clarity：clarity-setup.mjs create → 拿到 ID → 写进 <head>
□ 2. Firebase：firebase projects:create → firebase apps:create web → 记录 config
□ 3. Ahrefs：GSC 已接入 → Dashboard「Import from GSC」一步完成创建+验证+Site Audit（优先）；否则 ahrefs-setup.mjs create → verify
□ 4. Ahrefs WA：ahrefs-setup.mjs enable-wa → 拿到 data-key → 写进 <head>（requestIdleCallback 延迟加载，同 GA4）
□ 5. 部署站点（确认追踪代码上线）
□ 6. 去各平台确认数据开始采集（Ahrefs WA 用设置页「Recheck installation」验证）
```

完成任一步骤后，**立刻回写到 `.rankup/integrations.md`** 打 ✅ 并附证据和日期。`rankup review` 会逐项线上实测验证这张清单——不记就等于没做。详见 [`lifecycle.md`](lifecycle.md) 段 5 接入清单。
