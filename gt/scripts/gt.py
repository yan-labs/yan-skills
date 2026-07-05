#!/usr/bin/env python3
"""gt — Google Trends 查询工具（pytrends + opencli 双路由）

子命令：
  compare KW1 KW2 ...   关键词热度对比曲线（interest over time，0-100 归一化）
  region  KW1 [KW2...]  地区热度分布（哪个国家/州搜得多）
  related KW            相关查询（rising 飙升词 + top 高频词）
  hot                   每日热搜榜（走 opencli，不需要 venv）

通用选项：
  --geo CODE     地区代码，如 US/JP/GB；留空 "" = 全球（compare/region/related 默认全球）
  --time RANGE   时间范围：1m/3m/12m/5y/all 或 2024-01-01:2025-01-01（默认 12m）
  --raw          compare 不做月度聚合，输出原始（周级）数据
  --top N        region/related 显示前 N 条（默认 15）
  --region CODE  hot 的地区（默认 US；不支持 CN）
  --limit N      hot 显示条数（默认 20）

首次运行自动在 ~/.cache/gt-skill/venv 创建虚拟环境并安装 pytrends。
注意：pytrends 不能传 retries 参数（与 urllib3 v2 不兼容）。
"""

import os
import subprocess
import sys

VENV_DIR = os.path.expanduser("~/.cache/gt-skill/venv")
VENV_PY = os.path.join(VENV_DIR, "bin", "python")


def ensure_venv():
    """确保 venv 存在且装好 pytrends，然后用 venv 的 python 重新执行自己。"""
    if os.environ.get("GT_IN_VENV"):
        return
    if not os.path.exists(VENV_PY):
        print(f"[gt] 首次运行，创建虚拟环境 {VENV_DIR} ...", file=sys.stderr)
        os.makedirs(os.path.dirname(VENV_DIR), exist_ok=True)
        subprocess.run([sys.executable, "-m", "venv", VENV_DIR], check=True)
        subprocess.run(
            [VENV_PY, "-m", "pip", "install", "-q", "pytrends", "tabulate"], check=True
        )
        print("[gt] 环境就绪", file=sys.stderr)
    env = dict(os.environ, GT_IN_VENV="1")
    os.execve(VENV_PY, [VENV_PY, os.path.abspath(__file__)] + sys.argv[1:], env)


def parse_args(argv):
    """极简参数解析：位置参数 = 关键词，--key value / --flag。"""
    args, opts = [], {}
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("--raw",):
            opts[a[2:]] = True
            i += 1
        elif a.startswith("--"):
            if i + 1 >= len(argv):
                die(f"选项 {a} 缺少值")
            opts[a[2:]] = argv[i + 1]
            i += 2
        else:
            args.append(a)
            i += 1
    return args, opts


def die(msg, code=1):
    print(f"[gt] 错误：{msg}", file=sys.stderr)
    sys.exit(code)


def to_timeframe(t):
    presets = {
        "1m": "today 1-m",
        "3m": "today 3-m",
        "12m": "today 12-m",
        "1y": "today 12-m",
        "5y": "today 5-y",
        "all": "all",
    }
    if t in presets:
        return presets[t]
    if ":" in t:  # 2024-01-01:2025-01-01
        start, end = t.split(":", 1)
        return f"{start} {end}"
    return t  # 原样透传，允许 pytrends 原生格式


def build(kw_list, opts):
    from pytrends.request import TrendReq

    # 不传 retries/backoff_factor：pytrends 与 urllib3 v2 不兼容会抛
    # TypeError: method_whitelist
    pt = TrendReq(hl="en-US", tz=-480, timeout=(10, 30))
    geo = opts.get("geo", "")
    timeframe = to_timeframe(opts.get("time", "12m"))
    pt.build_payload(kw_list, timeframe=timeframe, geo=geo)
    return pt, geo, timeframe


def scope_line(geo, timeframe):
    return f"\n> 范围：{'全球' if not geo else geo} · {timeframe} · 数值为 0-100 归一化热度（100=区间内峰值）\n"


def cmd_compare(kws, opts):
    if not kws:
        die("compare 需要至少 1 个关键词，最多 5 个")
    if len(kws) > 5:
        die("Google Trends 一次最多对比 5 个关键词")
    pt, geo, timeframe = build(kws, opts)
    df = pt.interest_over_time()
    if df.empty:
        die("没有数据：关键词太冷门，或该地区/时间范围内无足够搜索量")
    df = df.drop(columns=["isPartial"], errors="ignore")
    if not opts.get("raw") and len(df) > 30:
        df = df.resample("ME").mean().round(1)
        df.index = df.index.strftime("%Y-%m")
        note = "（月均值；--raw 查看原始数据）"
    else:
        df.index = df.index.strftime("%Y-%m-%d")
        note = ""
    print(f"## 热度对比：{' vs '.join(kws)} {note}")
    print(scope_line(geo, timeframe))
    print(df.to_markdown())
    peaks = {k: (df[k].idxmax(), df[k].max()) for k in kws if k in df}
    print("\n**峰值**：" + "；".join(f"{k} → {v[1]}（{v[0]}）" for k, v in peaks.items()))


def cmd_region(kws, opts):
    if not kws:
        die("region 需要至少 1 个关键词")
    pt, geo, timeframe = build(kws[:5], opts)
    resolution = "REGION" if opts.get("geo") else "COUNTRY"
    df = pt.interest_by_region(resolution=resolution, inc_low_vol=False)
    df = df[df.sum(axis=1) > 0]
    if df.empty:
        die("没有地区数据")
    df = df.sort_values(kws[0], ascending=False).head(int(opts.get("top", 15)))
    print(f"## 地区热度分布：{' / '.join(kws[:5])}")
    print(scope_line(geo, timeframe))
    print(df.to_markdown())


def cmd_related(kws, opts):
    if len(kws) != 1:
        die("related 只支持单个关键词")
    pt, geo, timeframe = build(kws, opts)
    top_n = int(opts.get("top", 15))
    try:
        rq = pt.related_queries()
    except Exception as e:
        die(f"related_queries 接口失败（Google 偶尔改接口）：{type(e).__name__}: {e}")
    data = rq.get(kws[0], {})
    print(f"## 相关查询：{kws[0]}")
    print(scope_line(geo, timeframe))
    for kind, label in [("rising", "飙升（value=增长百分比）"), ("top", "高频（value=相对热度）")]:
        df = data.get(kind)
        print(f"### {label}")
        print(df.head(top_n).to_markdown(index=False) if df is not None else "（无数据）")
        print()


def cmd_hot(_kws, opts):
    region = opts.get("region", "US")
    if region.upper() == "CN":
        die("Google Trends 没有中国大陆的每日热搜 feed，试试 TW/HK/JP/US")
    limit = opts.get("limit", "20")
    r = subprocess.run(
        ["opencli", "google", "trends", "--region", region, "--limit", limit, "-f", "md"],
        capture_output=True, text=True,
    )
    if r.returncode != 0:
        die(f"opencli 调用失败：{r.stderr.strip() or r.stdout.strip()}")
    print(f"## 每日热搜榜（{region}）\n")
    # 过滤 opencli 的升级提示噪音
    for line in r.stdout.splitlines():
        if "Update available" in line or "npm install" in line or "Extension update" in line or "Download:" in line:
            continue
        print(line)


COMMANDS = {
    "compare": cmd_compare,
    "region": cmd_region,
    "related": cmd_related,
    "hot": cmd_hot,
}


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("-h", "--help", "help"):
        print(__doc__)
        sys.exit(0)
    cmd = argv[0]
    if cmd not in COMMANDS:
        die(f"未知子命令 {cmd}，可用：{', '.join(COMMANDS)}")
    if cmd != "hot":
        ensure_venv()
    kws, opts = parse_args(argv[1:])
    try:
        COMMANDS[cmd](kws, opts)
    except SystemExit:
        raise
    except Exception as e:
        msg = str(e)
        if "429" in msg:
            die("被 Google 限流了（429），等 1-2 分钟再试，或换个网络")
        die(f"{type(e).__name__}: {msg}")


if __name__ == "__main__":
    main()
