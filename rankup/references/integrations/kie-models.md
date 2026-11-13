# Kie 模型与价格快照

唯一选型表，日期 **2026-10-04**；旧证据只支持下列状态，不是今天继续有效的承诺。统一 Market 端点 `POST https://api.kie.ai/api/v1/jobs/createTask`、查询 `GET /api/v1/jobs/recordInfo?taskId=...`，体 `{model,input,callBackUrl?}`；部分音频/Veo/Runway 是专用协议，查官方索引，不套此表。

标准价格口径：**1 Kie 积分≈$0.005（200积分/$1）**；不含充值赠送、账户优惠。站内售卖积分是另一个单位。下表视频报价为无输入视频10秒，音频档明示；只用作预算估算，以实际终态 creditsConsumed 和账户兑换率结算。

| 模型 id | 关键 input / 能力 | 每条积分快照 | 证据与质量边界 |
|---|---|---|---|
| `bytedance/seedance-2-mini` | `reference_image_urls`≤9；`duration`4–15；`resolution`480p/720p；`aspect_ratio`含16:9；`generate_audio` | 480p38；720p82；音频开关未独立加价 | 【实测】双主体人/宠物，左右稳定且小动作清楚；案例仍有构图/道具瑕疵，未证明真实客户合格率；候选主模型 |
| `bytedance/seedance-2-fast` | 同 Mini，多图与首尾帧语义不同 | 480p117；720p248 | 【未实测】文档摘要；网关别名 seedance-2 曾映射 Fast，不是本体 |
| `bytedance/seedance-2` | ≤9图；4–15s；480p/720p/1080p/4K | 190/410/1020/2080 | 【未实测】文档摘要，不把 Mini 结果套给本体 |
| `bytedance/seedance-2-5` | schema≤30图（描述旧文字9有冲突）；4–30s；480p/720p/1080p | 280/630/1580 | 【未实测】接入时核验 maxItems，不照旧文字 |
| `wan/3-0-video` | `reference_image_urls`≤10，和首尾帧互斥；2–30s；`resolution`480P/720P/1080P（大写）；`audio` | 80/160/320 | 【实测】人脸更接近源图；宠物末尾淡暗和靠麦，作为人工选择候选，不自动切换 |
| `kling-3.0-omni/reference-to-video` | `image_urls`≤7；3–15s；720p/1080p/4K；`audio`；单镜头禁多 shots | 720p无声140/有声180；1080p180/230；4K670 | 【实测】双主体保留；人脸较小，宠物动作模糊，非默认备选 |
| `kling-3.0/video` | `kling_elements`最多3主体，各2–4图；`image_urls`首尾帧；`duration`字符串3–15；`mode`std/pro/4K；`sound` | std140/200；pro180/270；4K670 | 【未实测】不能把两头像传首尾来声明多主体 |
| `wan/2-7-r2v` | 图片+视频≤5；2–10s；720p/1080p | 160/240 | 【未实测】R2V schema 图片尺寸限额未完整公开 |
| `wan/3-0-video-prime` | 同 Wan3 | 约122/252/504 | 【未实测】产品美元舍入差异需复核 |
| `pixverse-v6/reference-to-video` | `image_references`≤7；`@ref_name`；1–15s；360/540/720/1080p | 无声45/63/81/162；有声63/81/108/207 | 【未实测】特定 R2V 图片限制需查该端点 |
| `minimax-h3/reference-to-video` | ≤9图，前5图不另计；4–15s；768P/2K | 80/130（两图）；多余图另计 | 【未实测】不能把内部 hailuo-3 别名当真实模型能力 |
| `happyhorse/reference-to-video` / `happyhorse-1-1/reference-to-video` | ≤9图；3–15s；720p/1080p | 280/480；1.1为225/290 | 【未实测】1.0/1.1图片字节上限不同 |
| `grok-imagine-video-1-5-preview` | ≤7图；1–15s；480p/720p，1080p仅单图；画幅默认auto（设计建议显式传入） | 480p24；720p45；1080p报价未核实 | 【未实测】不猜文生/1080p SKU |
| `gemini-omni-video` | ≤7图像单位，视频占2；4/6/8/10s；720p/1080p/4K | 720/1080为126；4K210；带视频另计 | 【未实测】未暴露独立画幅参数，prompt控制 |
| Veo 3.1 reference-to-video | 专用 API；1–3参考图；8s；720p/1080p/4K | Lite30/35/150，Fast60/65/180（8s） | 【未实测】Quality不支持R2V，普通I2V两张仍是首尾 |

带参考视频的估算与换人选型：Kie 侧（2026-11，未复核）Seedance 2 Mini + `reference_video` 480p/5s 约 24、720p/10s 约 100；Kling 2.6 motion-control 约 110；Wan 2.2 Animate Replace（原片换人）720p 约 125、480p 约 60，按「参考秒数+成片秒数」计费。Replicate 侧视频换人 `prunaai/p-video-2-pro-replace`（2026-11-13 【实测】）：768p 每输出秒 $0.05，10 秒实测扣费 $0.50；单次最多传 2 张照片，参数 `save_audio=true`、`ignore_audio=false`；远景换人成立，特写正脸换脸从本次实测无法确认；比 Kie 稳定。Kie 更便宜或非换人效果时继续用 Kie。【实测/用户定，2026-11-13】模板型视频玩法页不做上线前付费测试，上线后看生成日志迭代；获准做付费测试时每个测试点最多跑一次、禁测 60s 长片，Kie 侧测试用 480p、参考片段 ≤5 秒，只有最终上线样片用 720p。

图片（每张），均【文档摘要，未在本分支实测】：

| 模型 id | 输入要点 | 积分快照 |
|---|---|---|
| `gpt-image-2-5-flare-text-to-image` / `gpt-image-2-5-flare-image-to-image` | `prompt`；图生 `input_urls`；`resolution`1K/2K/4K；画幅和背景按 schema | 6/10/16 |
| `grok-imagine-image-2-0/text-to-image` / `grok-imagine-image-2-0/image-edit` | 文生 `aspect_ratio`必填；编辑 `image_urls`1–5张，可auto；文档URL叫image-to-image，model却是image-edit；不接受自造resolution/quality | 文生/改图4 |
| `nano-banana-2-lite` | `prompt`/`aspect_ratio`，`image_urls`1–10；无resolution/output_format | 公开4；既有单次回执与公开价不一致，不能预算按优惠值 |
| `nano-banana-2` | `image_input`；1K/2K/4K；输出 png/jpg | 8/12/18（需按SKU再核） |

后续示例网关方案改为 Nano 走 Google；Kie 的 Nano 能力仍是选项，但本表不构成该项目迁移 Kie 的决定。音频家族 Suno/TTS/音效可从索引发现，未实测、未沉淀精确参数/单价，选定后查专用文档。

## 复核价格与 schema

Mini/Fast 此快照限时价截至 **2026-10-07 06:00 UTC**；恢复价未公开。促销后、换时长/清晰度/输入视频/音频/模型版本前先复核，不把截图报价写死进产品。

1. 抓 [官方索引](https://docs.kie.ai/llms.txt)，找到精确 model 页 `.md`。用 [kie-docs-fetch](../../scripts/kie-docs-fetch.mjs) 保留原始 OpenAPI 与来源时间，比较 required/enum/default/maxItems；缺信息写未核实。
2. 公开价格：`POST https://api.kie.ai/client/v1/model-pricing/page`，JSON `{pageNum:1,pageSize:60,modelDescription:"seedance"}`（公开只读，不带生成 key）。翻页查 SKU；产品 HTML 的 `__NEXT_DATA__.pricingDesc` 也可对照。两边有矛盾以较新 SKU/终态实测为准，标清差异。
3. 明确输入视频计费是否包含输入+输出秒数；Mini/Fast 带视频较低单价不能套无视频任务。每模型音频、参考图、分辨率、视频输入可能改变 SKU。
4. 先按准确 SKU 预留，授权后一次最小验收才看实际 creditsConsumed；余额差额另记，价格不确定不能用更便宜参数冒充验收。

视频来源：[Mini](https://kie.ai/seedance-2-0-mini)、[Seedance2/Fast](https://kie.ai/seedance-2-0)、[2.5](https://kie.ai/seedance-2-5)、[Wan3](https://kie.ai/wan3.0-video)、[Kling3](https://kie.ai/kling-3-0)、[Omni](https://kie.ai/kling-o3)、其他精确页从 [官方索引](https://docs.kie.ai/llms.txt) 定位。图片价格来自同期官方公开 pricing API；端点须回到对应 `.md` schema，示例项目报告为实测来源，定位见 [入口的来源说明](kie.md#来源与复查)。
