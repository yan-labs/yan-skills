# 目录投放实跑手册（从清单到台账）

`submission-lanes.md` 讲**怎么分道**，`batch-campaign.md` 讲**批量怎么排队**。
本文补的是**一次真实跑完之后才知道的东西**——2026-08-22 一轮 11 个目标的实跑复盘，
5 submitted / 1 already-public / 5 skipped。

写它的理由：上一次开跑之前，我们以为难点是「填表」。**实际难点全在填表之前和之后。**

---

## 零、选目标前先读台账

每次选目标前必须读项目 `.backlink/ledger.json`。已 submitted 及之后状态
（`public`、`indexed`、`rel_verified`）的域名不再提交；rejected 的域名默认
也跳过，只有 notes 里写明的复活条件确认已满足，才用 `--include-rejected`
重新打开。`scripts/targets-select.mjs` 默认就从当前工作目录下的
`.backlink/ledger.json` 读这份排除名单，不需要额外传参——在项目目录里跑
它就够了。

同样重要的是收尾:**每次提交结束必须 `ledger.mjs upsert` + `transition` 把
结果写回台账**，否则下次选目标就会重复选中同一个域名、重复提交。

## 一、动手前必须拿到的两样东西

**1. 站主的显式授权，而且要问到具体粒度。**
目录收录是**公开且不可撤销**的记录，挂着品牌名与官方邮箱。
「你去做外链吧」不等于授权提交——**授权提交，不等于授权注册账号或付费**。
把这三件事分开确认，因为它们的后果完全不同。

**2. 一份 `product-profile.json`。** 提交文案（描述、分类、锚文本、目标页）
必须**事先定稿**，不能让驱动器现编。同一个产品在 20 个目录上写出 20 种描述，
是最容易被忽略的品牌伤害。

---

## 二、三条硬禁令：不管谁授权都不做

| 禁令 | 为什么 | 遇到怎么办 |
|---|---|---|
| **不注册账号** | 账号是身份决定，只能由站主本人做；驱动器还会被迫处理密码 | 该行转 skip，记 `account-required` |
| **不解验证码** | 明确的反自动化意图，绕过它就是滥用 | 转 Lane B 或 skip，记 `captcha-blocked` |
| **不选付费档、不填支付信息** | 花钱只能站主决定 | 选免费档；只有付费档则 skip |

第四条同等重要，但形态不同：

**不为了填满表单而编造事实。**
本轮 `spotSaaS` 的表单有一个必填的「Your Role」，我们没有任何可授权的取值——
**这一条直接 skip 掉了**，不是随便填一个。

判据很简单：**留空是诚实，编造不是。**
遇到必填的价格、融资轮次、员工人数、公司角色、实体地址，而产品并不具备时，
放弃这个目标，别放弃事实。

---

## 三、免费档是藏起来的，不是不存在

**本轮 5 个成功提交里，4 个在流程中途弹出付费升级**：

| 站点 | 被拒绝的付费档 |
|---|---|
| saashub.com | $75 Priority+ |
| 247webdirectory.com | $19.99 – $99.99 多档 |
| dizila.com | $39.99 Featured |
| launchingnext.com | $99 快审 |

**这是常态，不是例外。**这类站的默认路径会把你引向付费档，免费档往往在
「Regular Listing」「Free ($0)」「Standard」这类不显眼的位置，有时要滚到最下面。

所以：

- **看到价格不等于这个站要钱**，先找免费档再判 skip；
- 免费档通常附带「不保证审核」「排队更久」的说明，**这是可以接受的**——
  我们买的是链接不是速度；
- 台账 evidence 里**写清选了哪一档**（例：`Free ($0, lifetime, no review guarantee)`），
  否则三个月后没人能判断这条要不要续费。

---

## 四、有些链接不需要提交就已经存在

`sitelike.org` 本轮**根本没提交**——打开发现它早已自动抓取并列出了我们，
实测锚点 `rel="external nofollow noopener"`，链接真实存在。

**所以每个目标的第一步是「先看看我们在不在上面」，不是「打开提交表单」。**
重复提交一个已收录的站，轻则无效，重则触发它的去重/惩罚逻辑。

这类自动抓取型目录在清单里看起来和提交型没区别，只能逐个打开才知道。

---

## 五、记账：`submitted` 不是 `public`

这是本 Skill 最容易被违反的一条，批量跑的时候尤其容易。

| 状态 | 判据 |
|---|---|
| `submitted` | 表单被接受。**「谢谢，我们会审核」就到此为止** |
| `public` | **你亲眼看到一个活页面上挂着我们的链接** |
| `rel_verified` | 你抓了那个页面，读到了 `<a>` 的真实 `rel` |

**提交了 N 个表单，不是拿到了 N 条外链。**
本轮真实战果是：**1 条已存在的 nofollow 外链**，加 **6 条待审**。
把它汇报成「拿下 6 条外链」是虚报。

每一条都要落台账：

```bash
node scripts/ledger.mjs upsert --url <route> --file <project>/.backlink/ledger.json
node scripts/ledger.mjs transition --file ... --id <id> --state submitted --evidence "<你观察到了什么>"
```

`submitted` / `public` / `indexed` / `rel_verified` **强制要求 evidence**，
而 evidence 要写**观察到的**，不是期望的。

**台账会过期。** 本轮 Product Hunt 被驱动器记成 `rejected`（它跑的时候确实没做），
后来由主线程完成排期——**回来必须改那条记录**。
一条不再为真的台账记录，比没有记录更糟。

---

## 六、实测与记录不符：本轮改回数据，不留给下一轮

台账记的是这个项目做过什么；`data/submission-targets.json` 和
`data/free-channels.json` 记的是那个渠道**是什么样**，这一层同样会过期。
本轮如果观察到实测结果和记录对不上，改数据是收尾的一部分，不是"下次有空再说"：

| 实测观察 | 该改哪个字段 |
|---|---|
| 记录说 open-form / account:none，实测要登录 | `account`（free-channels）或 `gates`（submission-targets，去掉 `open-form`、加 `account`） |
| 记录说 `captcha: none`，实测出现验证码 | `captcha`（改成 `passive` / `interactive`，视挑战是否需要人工） |
| 记录说免费，实测有价值的路径只在付费档后面 | `payment`（改成 `optional` / `required`），必要时把整条移进 `paid-platforms.json` |
| 提交入口换了地址 | `route`（submission-targets）或 `homepage`（free-channels） |
| 站点已经打不开、被转卖、内容换了 | `status` 改 `dead`，`id` 保留不回收 |

改完在 `notes` 追加一句：日期 + 观察到了什么（例如「2026-09-07 实测：登录墙已出现，此前记录的
open-form 过期」），然后跑一遍 `scripts/validate-data.mjs` 再收工。不回写等于让下一轮在同一个坑里
再摔一次——参见 `write-back-or-repeat` 和 `fix-data-on-mismatch`。

---

## 七、跑完之后的复核（不要采信驱动器的汇报）

驱动器说「done」不是证据。至少做三件事：

1. **独立读一遍台账**，统计各状态计数，对得上汇报再往下走；
2. **抽验最强的那条断言**——账上任何 `public`，自己 `curl` 一遍看锚点真的在不在。
   本轮抽验了 `sitelike.org`，`rel` 与汇报一致；
3. **确认浏览器会话已释放**，`tab list` 必须返回 `[]`。

---

## 八、跑一轮的合理规模

**宁可 8 个做扎实，不要 16 个做潦草。**
清单里标 `route-unverified` 的（没人真正看过提交入口背后是什么）**不要在本轮花掉**——
先确认路由，下一轮再投。本轮据此主动留下 5 个未动，这是正确的收敛，不是没做完。

`curl` 核路由时**永远加 `-L`**：不跟随 301 会把活着的站报成「不可达」，
而这个假阴性会被原样写进结论。本轮就有一个目标因此差点被误杀。
