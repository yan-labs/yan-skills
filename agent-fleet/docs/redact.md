# 配置输出脱敏

本地依赖：Python 3；`safe-grep` 还需要 `rg`。不联网、不读凭据、不修改输入文件。

```sh
export PATH="/Users/kcsx/Project/kcsx/macmini/yan-skills/agent-fleet/bin:$PATH"
# 外部命令的两个输出通道都进入脱敏器；不要先输出原文。
配置读取命令 2>&1 | redact
safe-grep '目标变量名|目标主机名' /path/to/config-directory
redact --grep '目标变量名' /path/to/config-file
```

PATH 设置只影响当前终端；本任务不写白名单外的 `~/.local/bin` 或 shell 启动文件。派单模板也带了同一设置方法。

`redact` 从 stdin 逐行读取，在 stdout 输出，保留换行、键名和引号，以 `<redacted:类型>` 遮挡值。识别大小写不敏感的 password、passwd、pwd、secret、token、apikey/api_key、access_key、private_key、credential、auth 键的赋值（等号、JSON、常见 YAML 冒号）；连接 URL（用户名可为空）中的密码，保留用户名、主机和端口；阿里云 LTAI、腾讯云 AKID、AWS AKIA/ASIA 访问密钥标识（包括紧接 URL 编码分隔符的标识，保留周围结构）；Bearer；JWT；PEM 私钥块；Redis 口令：`requirepass`/`masterauth`/`sentinel auth-pass <主节点> <口令>`/`tls-key-file-pass` 的空格分隔写法（含 `CONFIG SET`、`redis-server --requirepass`）、`requirepass`/`REDIS_PASS` 键的等号或冒号写法、ACL 行（`user …` 或 `ACL SETUSER`）里的 `>口令`、`<旧口令` 和 64 位十六进制 `#哈希`、`AUTH [用户] 口令`（行首大写 AUTH，或 redis-cli 提示符后任意大小写，保留用户名）、同一行出现 redis-cli/benchmark/server/sentinel 时的 `-a 口令`、`--pass 口令`；至少 32 字符且混合大小写和数字的疑似随机串。普通路径、纯十六进制摘要、含扩展名的文件名、不含密码的普通 URL 保留。随机串即使出现在普通 URL 中也可能被遮挡。

`safe-grep PATTERN PATH [PATH ...]` 使用 rg 正则，包含隐藏及被 ignore 的文件（跳过 .git 内容），固定零上下文，不接受透传选项，保留文件名和行号；退出码 0=命中、1=无命中、2=错误。先在内存中把匹配文件完整脱敏，再只输出命中行，因此只搜到 PEM 中间行也不会直接暴露该行。不会输出上下文。rg 原始错误会被抑制，避免错误路径或模式泄露。二进制内容和非 UTF-8 路径不属于支持范围。检查大文件时会占用相应内存。输入可能在搜索和读取间变化，查正在改写的文件时需注意。

限制：这只是模式识别，降低概率，不保证。未知键下的短秘密、全小写或纯数字长秘密、纯十六进制秘密、编码/转义或拆行秘密、加密或嵌套序列化字段、新令牌格式、单独截出的 PEM 正文、K8s 的分行 name/value 表达等可能漏检；敏感键下的普通值和长随机文件名可能误遮；行首单独的 `AUTH xxx` 一类文字（如 "AUTH required"）也会被当成 Redis 命令遮挡。普通读取应在源头直接管道给 `redact`。工具不能拦截执行者绕开它直接读配置，环境变量、命令行参数和工具调用本身也不在过滤范围内。不要把真实凭据写进命令参数。读到未遮挡凭据立即停止该读取，只在报告「偏差」记录位置和类别。

本地检查（全部使用运行时拼接的假值，不读取真实配置）：

```sh
python3 test/redact-test.py
```
