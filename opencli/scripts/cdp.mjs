#!/usr/bin/env node
// opencli 2.0.x 没在命令行暴露 cdp / viewport，但守护进程支持 Page.cdp。
// 本脚本从已安装的 opencli 命令动态找到 Page，按会话名直发 CDP，不写死 pnpm 存储路径。
// 用法：node cdp.mjs <会话名> <CDP方法> [JSON参数]
//   例：node cdp.mjs s1 Emulation.setCPUThrottlingRate '{"rate":4}'
//       node cdp.mjs s1 Emulation.setDeviceMetricsOverride '{"width":390,"height":844,"deviceScaleFactor":3,"mobile":true}'
//       node cdp.mjs s1 Input.dispatchKeyEvent '{"type":"keyDown","key":"v","code":"KeyV","modifiers":4}'
// 注意：视口、CPU 降速等 Emulation 覆盖只在本进程连着时有效，进程退出即失效。
// 需要「先设视口/降速再测量」时用 --run，在同一进程里拿到 page 自己编排：
//   node cdp.mjs <会话名> --run measure.mjs   （measure.mjs: export default async (page) => { await page.cdp(...); return await page.evaluate("...") }）
// 按键、插入文字这类一次性输入可直接用第一种写法；可信输入请走 Input.*，不要在页面里派合成事件。
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const [session, method, json = "{}"] = process.argv.slice(2);
if (!session || !method) { console.error("用法：node cdp.mjs <会话名> <CDP方法> [JSON参数]"); process.exit(2); }
const shim = execFileSync("/bin/zsh", ["-lc", "command -v opencli"], { encoding: "utf8" }).trim();
const m = readFileSync(shim, "utf8").match(/([^\s"']*node_modules\/@jackwener\/opencli)\/dist\//);
if (!m) { console.error("找不到 opencli 安装目录：" + shim); process.exit(1); }
const pkg = m[1].startsWith("/") ? m[1] : path.join(path.dirname(shim), m[1]);
const { Page } = await import(pathToFileURL(path.join(pkg, "dist/src/browser/page.js")).href);
const page = new Page(session);
if (method === "--run") {
  const mod = await import(pathToFileURL(path.resolve(json)).href);
  try { console.log(JSON.stringify((await mod.default(page)) ?? {})); }
  finally { await page.cdp("Emulation.clearDeviceMetricsOverride", {}).catch(() => {}); await page.cdp("Emulation.setCPUThrottlingRate", { rate: 1 }).catch(() => {}); }
} else {
  console.log(JSON.stringify((await page.cdp(method, JSON.parse(json))) ?? {}));
}
