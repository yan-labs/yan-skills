# 可复用接入分支登记

此表只登记 Skill 自带、项目中立的资产；跨项目绝对路径索引由 `scripts/registry.mjs` 管理，不复制到这里。

| 需求 | 唯一入口 | 可复制实现 | 脚本 | 验证状态 |
|---|---|---|---|---|
| AI 视频/图片/音频供应商选择与 Kie / Replicate Pruna 换人接入 | [Kie 可选分支](integrations/kie.md) | [Worker 模板](../templates/kie/README.md) | [balance](../scripts/kie-balance.mjs)、[generate](../scripts/kie-generate.mjs)、[fake](../scripts/kie-fake-server.mjs)、[docs](../scripts/kie-docs-fetch.mjs) | 2026-10-04：真实余额只读、视频 CLI 假服务、D1/R2/邮件/HMAC 本地脚手架；2026-11-13：补充 Replicate Pruna `prunaai/p-video-2-pro-replace` 视频换人实测选型与价格边界 |

原始素材包 `kie-20261004` 的示例项目 `.rankup/`、后端代码和真实媒体指针保留在交付报告「来源索引」。规则不在登记表重复。
