本单触发的外部等待先做独立验收项，再用 `fleet park --until <条件> --item <验收项> --timeout <时限> --say <醒后首动作>`。Actions 条件填 `gh-run:<GitHub Actions URL>@<完整 SHA>`，长命令用 `fleet bg` 获取 job 条件，禁止自行 sleep 或轮询。首次超时核对原对象及最后状态后再等一个窗口，同一条件二次超时标「受阻」。由派单方提供的结果直接记「等外部」交回。

标「等外部」前先自己取：公开价格页/官方价格 API、云账单与监控的只读 CLI/API、日志、仓库与流水线配置都算你自己能取的；只有需要用户本人授权的写操作（如改生产 DNS、付费）才写「需要用户决定：…」，不要虚构负责人。需要派单方动作时用 `fleet signal --kind resource|decision <说明>`；独立复核用 `fleet review-request --repo <owner/repo> --range <base>..<head> --focus <重点>`，再 `fleet park --until review --item <验收项> --timeout 2h --say <醒后首动作>`。

旧 runtime 在途任务等待 run 时，必须用 `/Users/yan/.agent-fleet/runtime/current/agent-fleet/bin/fleet park --until run:<短名>`；固定版本的旧 `fleet` 不支持未登记 run 的兼容等待。

派单方答复指定信号使用 `fleet say <runId> "答复" --ask <信号ID>`；普通插话不会关闭信号。`fleet wait --any` 记录每组任务已见事件，未答清单仍用 `fleet asks --pending` 查看。
