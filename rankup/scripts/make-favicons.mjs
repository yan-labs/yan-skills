#!/usr/bin/env node

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { stat, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const execFileAsync = promisify(execFile);

function printUsage() {
  console.log(`用法: node scripts/make-favicons.mjs --src <logo.png> --out <public目录>

选项:
  --src, -s  品牌 logo 源图路径（至少 512x512 正方形）
  --out, -o  输出目录（通常为站点的 public 目录）
  --help, -h 显示帮助信息

生成标准图标集:
  - favicon.ico (内含 16, 32, 48)
  - favicon-48.png (48x48)
  - favicon-96.png (96x96)
  - favicon-192.png (192x192)
  - apple-touch-icon.png (180x180)
  - icon-512.png (512x512)
`);
}

function parseArgs(args) {
  const options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--src" || arg === "-s") {
      options.src = args[++i];
    } else if (arg === "--out" || arg === "-o") {
      options.out = args[++i];
    } else if (arg.startsWith("--src=")) {
      options.src = arg.slice(6);
    } else if (arg.startsWith("--out=")) {
      options.out = arg.slice(6);
    }
  }
  return options;
}

async function findMagick() {
  for (const cmd of ["magick", "convert"]) {
    try {
      await execFileAsync("which", [cmd]);
      return cmd;
    } catch {
      // not found, try next
    }
  }
  return null;
}

async function getImageDimensions(magickCmd, srcPath) {
  try {
    const { stdout } = await execFileAsync(magickCmd, [
      "identify",
      "-format",
      "%w %h",
      srcPath,
    ]);
    const parts = stdout.trim().split(/\s+/);
    if (parts.length >= 2) {
      return {
        width: parseInt(parts[0], 10),
        height: parseInt(parts[1], 10),
      };
    }
  } catch (err) {
    throw new Error(`读取源图尺寸失败: ${err.message}`);
  }
  throw new Error(`无法解析源图尺寸`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printUsage();
    process.exit(0);
  }

  if (!options.src || !options.out) {
    console.error("错误: 缺少必填参数 --src 或 --out\n");
    printUsage();
    process.exit(1);
  }

  const srcPath = path.resolve(options.src);
  const outDir = path.resolve(options.out);

  try {
    const srcStat = await stat(srcPath);
    if (!srcStat.isFile()) {
      console.error(`错误: 源文件不存在或不是普通文件: ${srcPath}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`错误: 无法访问源文件 ${srcPath}: ${err.message}`);
    process.exit(1);
  }

  const magickCmd = await findMagick();
  if (!magickCmd) {
    console.error("错误: 未找到 ImageMagick (magick / convert)，请先安装 ImageMagick");
    process.exit(1);
  }

  const { width, height } = await getImageDimensions(magickCmd, srcPath);
  console.log(`源图尺寸: ${width}x${height}`);

  if (width < 512 || height < 512) {
    console.error(
      `错误: 源图尺寸 (${width}x${height}) 小于 512x512。请提供至少 512x512 的品牌源图以确保清晰度。`,
    );
    process.exit(1);
  }

  if (width !== height) {
    console.warn(`警告: 源图不是正方形 (${width}x${height})，缩放为正方形可能会变形。`);
  }

  await mkdir(outDir, { recursive: true });

  const targets = [
    { name: "icon-512.png", size: 512 },
    { name: "favicon-192.png", size: 192 },
    { name: "apple-touch-icon.png", size: 180 },
    { name: "favicon-96.png", size: 96 },
    { name: "favicon-48.png", size: 48 },
  ];

  console.log(`\n正在生成图标至: ${outDir}`);

  for (const t of targets) {
    const destPath = path.join(outDir, t.name);
    await execFileAsync(magickCmd, [
      srcPath,
      "-resize",
      `${t.size}x${t.size}!`,
      destPath,
    ]);
    const fileStat = await stat(destPath);
    console.log(`  ✓ ${t.name} (${t.size}x${t.size}, ${fileStat.size} bytes)`);
  }

  // 生成 favicon.ico，包含 16, 32, 48
  const icoPath = path.join(outDir, "favicon.ico");
  await execFileAsync(magickCmd, [
    srcPath,
    "-define",
    "icon:auto-resize=16,32,48",
    icoPath,
  ]);
  const icoStat = await stat(icoPath);
  console.log(`  ✓ favicon.ico (包含 16, 32, 48 尺寸, ${icoStat.size} bytes)`);

  console.log("\n========================================================");
  console.log("推荐 Head 标签声明 (请替换或更新站点的 __root.tsx / index.html):");
  console.log("（注意：不要再引用与 logo 不一致的 SVG）\n");
  console.log(`<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48.png">
<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="manifest" href="/manifest.json">`);

  console.log("\n========================================================");
  console.log("推荐 manifest.json 的 icons 片段 (若原有 maskable 图标请保留):\n");
  console.log(
    JSON.stringify(
      {
        icons: [
          {
            src: "/favicon-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
          },
        ],
      },
      null,
      2,
    ),
  );
  console.log("========================================================\n");
}

main().catch((err) => {
  console.error(`执行失败: ${err.message}`);
  process.exit(1);
});
