---
{"description":"用 park 等待指定条件进入终态，再回读。","keywords":[],"auth":"review","action":"只读","acceptance":["V90 指定条件达到终态并完成回读｜owner：本单"]}
---
正文带齐流水线或提交标识、终态定义、可供 runner 检查的 park 条件和终态回读项。用 fleet park 释放名额，唤醒后回读并写验收表。同一条件二次超时写「受阻」和「等外部」。
