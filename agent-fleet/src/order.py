"""调遣令：全局唯一的临时调度令（dispatch-order.md）的读写、派单闸门与额度类失败自动记账。

文件默认 ~/.agents/dispatch-order.md（AGENT_FLEET_ORDER_FILE 可改），主体是一张表：
执行者 | 状态 | 有效至 | 原因与用户原话。fleet-go order / new / relaunch 与 run 结束钩子都走这里。
"""
import argparse
import contextlib
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import tempfile

EXECUTORS = ('codex', 'openai-api', 'claude-sub', 'claude-api', 'grok', 'gemini', 'jev', '全局')
ALIASES = {'gpt': 'codex', 'openai': 'openai-api', 'claude': 'claude-api', 'sub': 'claude-sub', 'subagent': 'claude-sub',
           'global': '全局'}
STATES = ('优先', '正常', '省着用', '停用')
# fleet-go --to 对应的调遣令执行者；claude-sub（Agent 工具 executor-*）不经 fleet，只能手动记。
TO_EXECUTOR = {'gpt': 'codex', 'openai': 'openai-api', 'claude': 'claude-api', 'grok': 'grok', 'gemini': 'gemini', 'jev': 'jev'}
NO_LIMIT = '用户另说'
HEADER = ('执行者', '状态', '有效至', '原因与用户原话')
# 解析出的重置时间距现在不足这么久，视为瞬时限流，不记账。
MIN_RESET_SECONDS = 600

# 额度类失败识别表：fleet run 的 route（模型路由名）归到调遣令执行者，再用该执行者自己的规则判断。
# 人读版见 skill/references/fallback-chains.md「什么算不可用」；这里是唯一的机读版。
# reset：重置时间的取法，依次尝试；'est:' 开头是估计（reason 里会标「估计」），'none' 表示没有自动重置，写「用户另说」。
ROUTE_EXECUTOR = [(r'^gpt-', 'codex'), (r'^openai-', 'openai-api'), (r'^claude-', 'claude-api'), (r'^grok', 'grok'),
                  (r'^kollab-gateway-(?:copy|bulk|research)|gemini', 'gemini'), (r'^jev', 'jev')]
HTTP_402 = r'(?:status|http|code)["\s:=]{0,4}402\b|\b402\s+payment'
QUOTA_RULES = {
    'codex': {'match': r'usage[_ ]limit|hit your usage|weekly (?:usage|limit)|周用量|额度已用尽|额度用尽',
              'reset': ['codex_quota', 'fields', 'try_again', 'est:24h'], 'label': 'Codex 用量上限'},
    'openai-api': {'match': r'insufficient[_ ]quota|exceeded your current quota|billing_hard_limit|credit_balance_exhausted',
                   'reset': ['fields', 'try_again', 'none'], 'label': 'OpenAI API 额度'},
    'claude-api': {'match': r'credit balance is too low|credit_balance|insufficient credits?|' + HTTP_402 + r'|monthly (?:usage|limit)',
                   'reset': ['fields', 'try_again', 'est:month'], 'label': 'Claude API 月度额度'},
    'grok': {'match': r'usage balance exhausted|payment required|' + HTTP_402,
             'reset': ['fields', 'try_again', 'est:week'], 'label': 'Grok Build 额度'},
    'gemini': {'match': r'payment required|budget|预算|insufficient (?:credits?|balance)|余额不足|' + HTTP_402,
               'reset': ['fields', 'est:hour'], 'label': 'Gemini 网关预算'},
}
ESTIMATES = {'24h': '按 24 小时估计', 'week': '按周重置估计（7 天）', 'month': '按每月 1 日 00:00 UTC 重置估计',
             'hour': '按网关下一整点（UTC）估计'}


class OrderError(ValueError):
    pass


def order_path():
    return Path(os.environ.get('AGENT_FLEET_ORDER_FILE') or (Path.home() / '.agents' / 'dispatch-order.md'))


def now_local():
    return datetime.datetime.now().astimezone()


def normalize_executor(value):
    value = ALIASES.get(value, value)
    if value not in EXECUTORS:
        raise OrderError('未知执行者：' + value + '。可用：' + '、'.join(EXECUTORS))
    return value


def parse_until(raw, now=None):
    """None = 无期限（用户另说）；纯日期取当天结束；无时区按本机时区；+6h / +3d 相对现在。"""
    now = now or now_local()
    text = (raw or '').strip()
    if text in ('', NO_LIMIT, '-', '—', '无'):
        return None
    rel = re.fullmatch(r'\+(\d+)([mhdw])', text)
    if rel:
        unit = {'m': 'minutes', 'h': 'hours', 'd': 'days', 'w': 'weeks'}[rel[2]]
        return now + datetime.timedelta(**{unit: int(rel[1])})
    try:
        if re.fullmatch(r'\d{4}-\d{2}-\d{2}', text):
            value = datetime.datetime.combine(datetime.date.fromisoformat(text), datetime.time(23, 59, 59))
        else:
            value = datetime.datetime.fromisoformat(re.sub(r'^(\d{4}-\d{2}-\d{2}) ', r'\1T', text).replace('Z', '+00:00'))
    except ValueError:
        raise OrderError('有效至无法解析：' + text + '。写 ISO 时间（2026-11-17T08:00+08:00）、日期、+6h / +3d 或「' + NO_LIMIT + '」。')
    return value if value.tzinfo else value.astimezone()


def format_until(value):
    return NO_LIMIT if value is None else value.astimezone().isoformat(timespec='minutes')


def escape_cell(text):
    return re.sub(r'\s+', ' ', str(text)).replace('|', '\\|').strip()


def split_row(line):
    body = line.strip()
    if not (body.startswith('|') and body.endswith('|')):
        return None
    cells = [c.replace('\\|', '|').strip() for c in re.split(r'(?<!\\)\|', body[1:-1])]
    return cells if len(cells) == 4 else None


class Order:
    def __init__(self, executor, state, until_raw, reason, now=None):
        self.executor, self.state, self.until_raw, self.reason = executor, state, until_raw, reason
        try:
            self.until, self.bad_until = parse_until(until_raw, now), False
        except OrderError:
            self.until, self.bad_until = None, True  # 解析不了就当无期限，令继续生效

    def active(self, now):
        return self.until is None or self.until > now

    def effective_state(self, now):
        return self.state if self.active(now) else '正常'

    @property
    def is_auto(self):
        return self.reason.startswith('自动：')

    def line(self):
        return '| ' + ' | '.join([self.executor, self.state, self.until_raw or NO_LIMIT, escape_cell(self.reason)]) + ' |'


def load(path=None, now=None):
    """返回 (orders, 无法解析的行数)；文件不存在抛 FileNotFoundError。"""
    path = path or order_path()
    orders, bad = {}, 0
    for line in path.read_text().splitlines():
        cells = split_row(line)
        if cells is None:
            if line.strip().startswith('|') and not re.fullmatch(r'[\s|:-]+', line.strip()):
                bad += 1
            continue
        if cells[0] == HEADER[0] or re.fullmatch(r'[\s:-]*', ''.join(cells[:2])):
            continue
        if cells[0] not in EXECUTORS or cells[1] not in STATES:
            bad += 1
            continue
        orders[cells[0]] = Order(cells[0], cells[1], cells[2], cells[3], now)
    if not orders:
        raise OrderError('调遣令表里没有可解析的行')
    return orders, bad


def show_text(path=None, now=None):
    path = path or order_path()
    now = now or now_local()
    try:
        orders, bad = load(path, now)
    except FileNotFoundError:
        return f'调遣令文件不存在：{path}（当前没有任何令，按 skill 里的常规路由与顺位办）。'
    out = [f'调遣令（{path}；现在 {now.isoformat(timespec="minutes")}）。下列生效的令优先于所有路由与顺位：']
    live = [o for o in orders.values() if o.active(now)]
    expired = [o for o in orders.values() if not o.active(now)]
    for state in ('停用', '省着用', '优先'):
        for o in live:
            if o.state == state:
                out.append(f'- {state} {o.executor}（有效至 {o.until_raw or NO_LIMIT}）：{o.reason}')
    plain = [o.executor for o in live if o.state == '正常' and not o.reason]
    if plain:
        out.append('- 正常：' + '、'.join(plain))
    for o in live:
        if o.state == '正常' and o.reason:
            out.append(f'- 正常 {o.executor}：{o.reason}')
    first = [o.executor for o in live if o.state == '优先']
    out.append('当前优先：' + ('、'.join(first) if first else '无'))
    for o in expired:
        note = '已到重置时间，已恢复，可清理' if o.state == '停用' else '已到期失效，可清理'
        out.append(f'- 过期忽略 {o.executor} {o.state}（有效至 {o.until_raw}）：{note}（fleet-go order clear {o.executor}）；原因：{o.reason}')
    if bad:
        out.append(f'提示：表里有 {bad} 行无法解析，已跳过。')
    out.append('改令：fleet-go order set <执行者> <优先|正常|省着用|停用> [--until <ISO|+6h|+3d|' + NO_LIMIT + '>] [--reason "原话与日期"]；恢复：fleet-go order clear <执行者>')
    return '\n'.join(out)


def gate(to, override=None, now=None, warn=lambda m: print(m, file=sys.stderr)):
    """派单闸门：停用且无 override 抛 OrderError；返回写进 brief 的偏差说明（放行时）或 None。读不到令一律警告后照常。"""
    now = now or now_local()
    executor = TO_EXECUTOR[to]
    try:
        orders, _ = load(order_path(), now)
    except FileNotFoundError:
        warn(f'警告：调遣令文件不存在（{order_path()}），未检查调遣令，照常派单。')
        return None
    except (OSError, OrderError, UnicodeDecodeError) as error:
        warn(f'警告：调遣令读取失败（{error}），未检查调遣令，照常派单。')
        return None
    hit = [o for o in (orders.get(executor), orders.get('全局')) if o and o.active(now)]
    for o in hit:
        if o.state == '省着用':
            warn(f'警告：调遣令把 {o.executor} 设为「省着用」（有效至 {o.until_raw or NO_LIMIT}）：{o.reason}。只给值得的活。')
    stopped = next((o for o in hit if o.state == '停用'), None)
    if not stopped:
        return None
    detail = f'{stopped.executor} 当前「停用」（有效至 {stopped.until_raw or NO_LIMIT}）：{stopped.reason}'
    if override:
        warn(f'警告：调遣令拦截已用 --override-order 放行：{detail}')
        return f'调遣令偏差：{detail}；派单方以 --override-order 放行，理由：{override}。报告「偏差」一节须记录。'
    first = [o.executor for o in orders.values() if o.active(now) and o.state == '优先']
    free = [o.executor for o in orders.values() if o.active(now) and o.state in ('正常', '省着用') and o.executor != '全局']
    raise OrderError(f'调遣令拒绝：{detail}\n当前优先的执行者：{"、".join(first) or "无"}；可用：{"、".join(free) or "无"}'
                     '（claude-sub 用 Agent 工具的 executor-*，不经 fleet-go）。\n'
                     f'确需放行：加 --override-order "理由"（写进 brief 偏差和账本）；解除令：fleet-go order clear {stopped.executor}。')


@contextlib.contextmanager
def locked():
    """多个 run 同时因额度失败时串行改文件。"""
    with open(Path(tempfile.gettempdir()) / 'fleet-dispatch-order.lock', 'a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        yield


def git(top, *args, timeout=30):
    return subprocess.run(['git', '-C', str(top), *args], capture_output=True, text=True, timeout=timeout)


def commit_file(target, message, background=False, warn=lambda m: print(m, file=sys.stderr)):
    """只提交调遣令这一个文件；有远端就推，失败只警告。不在 git 仓库里就什么都不做。"""
    try:
        top = git(target.parent, 'rev-parse', '--show-toplevel')
        if top.returncode:
            return
        top = top.stdout.strip()
        if not git(top, 'status', '--porcelain', '--', str(target)).stdout.strip():
            return
        if git(top, 'add', '--', str(target)).returncode or git(top, 'commit', '-m', message, '--', str(target)).returncode:
            warn('警告：调遣令已改，但提交失败，请手动提交 ' + str(target))
            return
        if not git(top, 'remote').stdout.strip():
            return
        if background:
            subprocess.Popen(['git', '-C', top, 'push'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                             stderr=subprocess.DEVNULL, start_new_session=True)
        elif git(top, 'push', timeout=30).returncode:
            warn('警告：调遣令已提交但推送失败，请稍后手动 git push。')
    except (OSError, subprocess.SubprocessError) as error:
        warn(f'警告：调遣令提交/推送出错（{type(error).__name__}），请手动处理。')


def write_order(executor, build, message, background=False, warn=lambda m: print(m, file=sys.stderr)):
    """改/加一行，其余内容原样保留。build(旧令或 None) 返回要写的 Order，返回 None 表示放弃。"""
    with locked():
        path = order_path()
        target = Path(os.path.realpath(path))
        if not target.exists():
            raise OrderError('调遣令文件不存在：' + str(path))
        lines = target.read_text().splitlines()
        row = next((i for i, line in enumerate(lines) if (c := split_row(line)) and c[0] == executor), None)
        order = build(load_one(lines[row]) if row is not None else None)
        if order is None:
            return None
        if row is not None:
            lines[row] = order.line()
        else:
            last = max((i for i, line in enumerate(lines) if split_row(line)), default=len(lines) - 1)
            lines.insert(last + 1, order.line())
        tmp = target.with_name(target.name + '.tmp')
        tmp.write_text('\n'.join(lines) + '\n')
        os.replace(tmp, target)
        commit_file(target, message, background, warn)
        return order


def load_one(line):
    cells = split_row(line)
    return Order(*cells) if cells and cells[0] in EXECUTORS and cells[1] in STATES else None


def set_order(executor, state, until=None, reason='', now=None):
    executor = normalize_executor(executor)
    if state not in STATES:
        raise OrderError('未知状态：' + state + '。可用：' + '、'.join(STATES))
    now = now or now_local()
    until_raw = format_until(parse_until(until, now)) if until else NO_LIMIT
    order = Order(executor, state, until_raw, reason, now)
    write_order(executor, lambda old: order, f'chore(order): {executor} {state}' + ('' if until_raw == NO_LIMIT else f' 至 {until_raw}'))
    return order


def clear_order(executor, now=None):
    executor = normalize_executor(executor)
    now = now or now_local()
    order = Order(executor, '正常', NO_LIMIT, '已清除（' + now.date().isoformat() + '）', now)
    write_order(executor, lambda old: order, f'chore(order): {executor} 恢复正常')
    return order


# ---- 额度类失败自动记账 ----

def executor_of_route(route):
    return next((ex for pattern, ex in ROUTE_EXECUTOR if re.search(pattern, str(route or ''), re.I)), None)


def scrub(text):
    text = re.sub(r'(?i)\bBearer\s+[A-Za-z0-9._~+/=-]+', 'Bearer [REDACTED]', text)
    text = re.sub(r'(?i)\b((?:api[_-]?key|token|secret|password|authorization)["\']?\s*[:=]\s*["\']?)[^\s"\',;}]+', r'\1[REDACTED]', text)
    text = re.sub(r'\bsk-[A-Za-z0-9_-]{8,}', 'sk-[REDACTED]', text)
    return re.sub(r'(?<![\w/+.-])[A-Za-z0-9_+/-]{32,}={0,2}(?![\w/+.=-])', '[REDACTED]', text)


def epoch_to_dt(number):
    return datetime.datetime.fromtimestamp(number / 1000 if number > 1e12 else number).astimezone()


def parse_fields(text, now):
    """从错误/响应文本里找 resetsAt、reset_at、Retry-After 等字段，取最晚的未来时间。"""
    found = []
    for key, value in re.findall(r'(?i)["\']?(resets?[_-]?at|reset[_-]?time|resets?[_-]?in[_-]?seconds|retry[_-]?after(?:[_-]?ms)?)["\']?\s*[:=]\s*["\']?([0-9][0-9T:.+\-]*Z?)', text):
        k = key.lower().replace('-', '').replace('_', '')
        try:
            if re.fullmatch(r'\d+(?:\.\d+)?', value):
                number = float(value)
                if k.startswith('retryafter'):
                    found.append(now + datetime.timedelta(milliseconds=number if k.endswith('ms') else number * 1000))
                elif k.endswith('seconds'):
                    found.append(now + datetime.timedelta(seconds=number))
                elif number > 1e9:
                    found.append(epoch_to_dt(number))
            else:
                found.append(parse_until(value.strip(), now))
        except (OrderError, ValueError, OverflowError, OSError):
            pass
    return max((d for d in found if d and d > now), default=None)


def parse_try_again(text, now):
    m = re.search(r'(?i)try again in ((?:\d+\s*(?:days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b[ ,and]*)+)', text)
    if not m:
        return None
    seconds = 0
    for number, unit in re.findall(r'(?i)(\d+)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)\b', m[1]):
        seconds += int(number) * {'d': 86400, 'h': 3600, 'm': 60, 's': 1}[unit[0].lower()]
    return now + datetime.timedelta(seconds=seconds)


def estimate(kind, now):
    utc = now.astimezone(datetime.timezone.utc)
    if kind == '24h':
        return now + datetime.timedelta(hours=24)
    if kind == 'week':
        return now + datetime.timedelta(days=7)
    if kind == 'month':
        year, month = (utc.year + 1, 1) if utc.month == 12 else (utc.year, utc.month + 1)
        return datetime.datetime(year, month, 1, tzinfo=datetime.timezone.utc)
    return (utc.replace(minute=0, second=0, microsecond=0) + datetime.timedelta(hours=1))


def detect_quota(route, text, codex_quota=None, now=None):
    """命中额度类失败返回 {executor,until,estimated,basis,summary}，否则 None。瞬时限流（重置不足 10 分钟）也返回 None。"""
    now = now or now_local()
    executor = executor_of_route(route)
    rule = QUOTA_RULES.get(executor)
    match = rule and re.search(rule['match'], text, re.I)
    if not match:
        return None
    for strategy in rule['reset']:
        until, estimated, basis = None, False, ''
        if strategy == 'codex_quota' and codex_quota and (codex_quota.get('resetsAt') or 0) > 0:
            until, basis = epoch_to_dt(float(codex_quota['resetsAt'])), 'Codex 用量记录 resetsAt'
        elif strategy == 'fields':
            until, basis = parse_fields(text, now), '错误信息里的重置字段'
        elif strategy == 'try_again':
            until, basis = parse_try_again(text, now), '错误信息里的 try again 提示'
        elif strategy.startswith('est:'):
            until, estimated, basis = estimate(strategy[4:], now), True, ESTIMATES[strategy[4:]]
        elif strategy == 'none':
            basis = '没有自动重置，充值后手动 clear'
        else:
            continue
        if strategy == 'none' or until:
            break
    else:
        return None
    if until and not estimated and (until - now).total_seconds() < MIN_RESET_SECONDS:
        return None
    line = next((l for l in text.splitlines() if re.search(rule['match'], l, re.I)), match[0])
    line = re.sub(r'\s+', ' ', line)
    at = re.search(rule['match'], line, re.I).start()
    summary = scrub(line[max(0, at - 40):at + 80]).strip() or rule['label']
    return {'executor': executor, 'until': until, 'estimated': estimated, 'basis': basis, 'summary': summary, 'label': rule['label']}


def auto_record(info, now=None, warn=lambda m: None):
    """run 失败结束时调用：额度类就写「停用 + 重置时间」。人工写的有效令不覆盖停用；返回一行结果说明。"""
    now = now or now_local()
    hit = detect_quota(info.get('route'), info.get('text') or '', info.get('codexQuota'), now)
    if not hit:
        return '不是额度类失败，未记账。'
    finished = info.get('finishedAt')
    try:
        at = datetime.datetime.fromisoformat(str(finished).replace('Z', '+00:00')).astimezone() if finished else now
    except ValueError:
        at = now
    stamp = at.strftime('%Y-%m-%d %H:%M')
    reason = f'自动：{info.get("name") or info.get("runId")} {stamp} 报 {hit["summary"]}'
    reason += f'（{hit["label"]}；重置时间估计：{hit["basis"]}）' if hit['estimated'] else f'（{hit["label"]}；重置时间取自{hit["basis"]}）'
    until = hit['until']
    executor = hit['executor']

    def build(old):
        text = reason
        if old is not None and old.active(now):
            if not old.is_auto:
                if old.state == '停用':
                    return None  # 人工停用令不动
                text += f'；原令：{old.state}（{old.reason[:60]}），重置后请重新确认'
            elif stamp in old.reason and (info.get('name') or '') in old.reason:
                return None  # 同一个 run 已记过
            elif old.until is None or until is None:
                if not (old.until is not None and until is None):
                    return None
            elif not (until > old.until or ('估计' in old.reason and not hit['estimated'])):
                return None
        return Order(executor, '停用', format_until(until), text, now)

    written = write_order(executor, build, f'chore(order): 自动停用 {executor}' + (f' 至 {format_until(until)}' if until else ''),
                          background=True, warn=warn)
    return (f'已记入调遣令：{executor} 停用，有效至 {written.until_raw}' if written else '调遣令已有更强或人工的令，未改。')


# ---- 命令行 ----

def add_parser(sub):
    p = sub.add_parser('order', help='调遣令：show / set / clear / auto')
    ops = p.add_subparsers(dest='order_action', required=True)
    ops.add_parser('show')
    s = ops.add_parser('set')
    s.add_argument('executor')
    s.add_argument('state', choices=STATES)
    s.add_argument('--until', help='ISO 时间、日期、+6h / +3d，或「' + NO_LIMIT + '」（默认）')
    s.add_argument('--reason', default='', help='原因与用户原话（含日期）')
    c = ops.add_parser('clear')
    c.add_argument('executor')
    ops.add_parser('auto', help='stdin 读 {runId,name,route,text,finishedAt,codexQuota}，额度类失败就记账')


def main(args):
    if args.order_action == 'show':
        print(show_text())
    elif args.order_action == 'set':
        order = set_order(args.executor, args.state, args.until, args.reason)
        print(f'已写入：{order.executor} {order.state} 有效至 {order.until_raw}')
    elif args.order_action == 'clear':
        order = clear_order(args.executor)
        print(f'已恢复正常：{order.executor}')
    else:
        print(auto_record(json.loads(sys.stdin.read() or '{}')))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    add_parser(parser.add_subparsers(dest='action', required=True))
    try:
        main(parser.parse_args(['order', *sys.argv[1:]]))
    except (OrderError, OSError, ValueError) as error:
        print('错误：' + str(error), file=sys.stderr)
        sys.exit(1)
