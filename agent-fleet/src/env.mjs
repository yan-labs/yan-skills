// 极简 .env 加载器。不引入 dotenv 这类依赖——本文件只做「读一个 KEY=VALUE 文本文件,
// 塞进 process.env」这一件事,没必要为此多一个 npm 包。
//
// 规则:
//   - 已经存在于 process.env 的变量不会被覆盖(真实 shell export 优先于 .env 文件)。
//   - 支持 `# 注释` 整行和行内注释、空行、可选的单/双引号包裹值。
//   - 找不到 .env 文件时静默跳过——没有 .env 也应该能跑(比如用户直接 export 了变量)。

import { readFileSync, existsSync } from 'node:fs';

/**
 * 从指定路径读取 .env 文件并写入 process.env(不覆盖已存在的变量)。
 * 调用方:bin/agent-fleet.mjs 启动时,以及 test/smoke-test.mjs 里为了不污染真实
 * 环境而单独调用。
 */
export function loadEnvFile(envPath) {
  if (!existsSync(envPath)) return;

  const raw = readFileSync(envPath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();

    // 去掉包裹的引号(简单场景足够,不处理转义字符)。
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}
