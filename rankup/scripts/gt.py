#!/usr/bin/env python3
"""gt — Google Trends 查询工具（新版 Explore UI，走 opencli 驱动已登录 Chrome）

2026-09-09 切版：Google Trends 上线了新版 Explore UI（https://trends.google.com/explore?...），
本工具改走新版路由（rankup/scripts/gt-browser.mjs）。旧版路由（/trends/explore + widget REST
接口）已归档到 rankup/scripts/archive/gt-v1/，两套 UI 目前并存，新版接口出问题时可以拿旧版对拍。

子命令：
  compare KW1 KW2 ...   关键词热度对比曲线（interest over time，0-100 归一化）
  region  KW1 [KW2...]  地区热度分布（哪个国家搜得多）
  related KW             相关查询（rising 飙升词 + top 高频词，仅支持单个关键词）
  hot                    每日热搜榜（走 opencli，跟新旧版 Explore 切换无关）
  close                  释放浏览器会话

通用选项：
  --geo CODE     地区代码，如 US/JP/GB；留空 "" = 全球
  --time RANGE   时间范围：1h/4h/1d/7d/28d/30d/1m/3m/12m/5y/all 或 2024-01-01:2025-01-01（默认 12m）
  --raw          保留兼容选项（新版 compare 输出的已是未聚合的周级数据）
  --property P   搜索类型：web（默认）/images/news/youtube/shopping
  --category N   Trends 类目编号（0=全部）
  --top N        region/related 显示前 N 条（默认 15）
  --region CODE  hot 的地区（默认 US；不支持 CN）
  --limit N      hot 显示条数（默认 20）
  --via ROUTE    取数路由：browser（默认，唯一支持的路由）
  --session NAME  browser 会话名（默认 rankup-gt-trends-<每对话唯一后缀>）
  --keep-session  browser 跑完保留会话，连续查询后用 close 释放

--via pytrends 已不可用：新版 Explore UI 用的是 Google 内部 batchexecute RPC 框架，
pytrends 打的是旧版 /trends/api/* 匿名 REST 接口，新版页面不再稳定暴露那套接口。
需要 pytrends 路由，用归档版：rankup/scripts/archive/gt-v1/gt.py --via pytrends
"""

import os
import subprocess
import sys

BROWSER_SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "gt-browser.mjs")
ARCHIVE_GT_V1 = os.path.join(os.path.dirname(os.path.abspath(__file__)), "archive", "gt-v1", "gt.py")


def die(msg, code=1):
    print(f"[gt] 错误：{msg}", file=sys.stderr)
    sys.exit(code)


def run_browser(argv):
    """把整条命令原样转给 gt-browser.mjs（选项名和输出格式都是一致的）。"""
    r = subprocess.run(["node", BROWSER_SCRIPT] + argv)
    sys.exit(r.returncode)


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        sys.exit(0)
    cmd = argv[0]
    valid = ("compare", "region", "related", "hot", "close")
    if cmd not in valid:
        die(f"未知子命令 {cmd}，可用：{', '.join(valid)}")

    rest = argv[1:]
    via = "browser"
    if "--via" in rest:
        i = rest.index("--via")
        if i + 1 >= len(rest):
            die("选项 --via 缺少值")
        via = rest[i + 1]
        rest = rest[:i] + rest[i + 2:]

    if via == "pytrends":
        die(
            "新版 Explore UI 下 --via pytrends 不可用（pytrends 打的是旧版 /trends/api/* 接口，"
            "新版页面不再稳定暴露）。改用归档版：\n"
            f"  python3 {ARCHIVE_GT_V1} {cmd} {' '.join(rest)} --via pytrends"
        )
    if via == "auto":
        print("[gt] --via auto 在新版路由下等价于 browser（没有可回落的匿名路由）", file=sys.stderr)
        via = "browser"
    if via != "browser":
        die(f"未知路由 {via}，可用：browser（pytrends 仅归档版支持）")

    run_browser([cmd] + rest)


if __name__ == "__main__":
    main()
