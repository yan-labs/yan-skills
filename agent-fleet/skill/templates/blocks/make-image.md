输出目录绝对路径：`{OUTDIR}`（先 mkdir -p）。
逐张编号：`01-image.png` 起，逐张写清具体描述、精确文件名、像素尺寸/比例；正文指定的名称与尺寸优先，否则 1024×1024、1:1。
共享风格块：按正文统一画风、背景、hex 调色板、光线和镜头；同套图保持一致。
No text, no letters, no logos, no watermarks.
If you genuinely cannot generate images, say so plainly. Do not substitute placeholders, ASCII art, solid rectangles, or images downloaded from the web.
Report per file: absolute path, actual pixels, bytes, alpha yes/no, method used（工具/模型、有无本地后处理）。
透明图必须 true alpha, not a white/dark square。
If the exact size is unsupported, generate the nearest aspect and resize locally (sips / PIL) to the exact pixels; keep alpha for transparent items.
