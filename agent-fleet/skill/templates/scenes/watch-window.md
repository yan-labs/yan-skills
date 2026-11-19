---
{"description":"固定窗口内由 fleet-watch 取数，模型只裁定变化。","keywords":[],"auth":"review","action":"只读","acceptance":["V90 窗口结束并取得每个间隔的事实行｜owner：本单"]}
---
正文带齐起止时间、间隔、每个指标的 owner、取数命令和阈值。沿用 fleet-watch 按间隔取数，仅越阈值或状态变化时裁定脚本给出的事实行；异常交主会话处理。
