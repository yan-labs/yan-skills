"""组装和修订派单 brief，供 fleet-go 命令调用；执行与停止仍交给 fleet。"""
import argparse
import datetime
import errno
import json
import os
from pathlib import Path
import re
import shlex
import subprocess
import sys
import time

BLOCKS = Path(__file__).resolve().parents[1] / 'skill/templates/blocks'
PRODUCTS = {'gpt': '(a) Codex 编码', 'claude': 'Claude 月度额度',
            'grok': 'Grok Build CLI', 'gemini': 'Gemini 文本任务', 'jev': 'JEV 判断'}
AUTH = ['local', 'readonly-web', 'deploy-prod', 'paid', 'review']
PITFALLS = ['node-proxy', 'zsh', 'pnpm-entry', 'local-preview', 'playwright-clean', 'shared-tree', 'secrets', 'fleet-bg', 'ssr-check']


def block(name, values=None):
    text = (BLOCKS / (name + '.md')).read_text().strip()
    for key, value in (values or {}).items():
        text = text.replace('{' + key + '}', value)
    return text


def rule():
    stored = block('rule-sentence')
    source = Path.home() / '.claude/CLAUDE.md'
    if source.exists():
        match = re.search(r'禁止单纯转发，允许分发子步骤：[^\n]+?最终给出真正的结论作为你的最终答案', source.read_text())
        if not match or match[0] != stored:
            raise ValueError('规则句与 ~/.claude/CLAUDE.md 不一致，请先同步 rule-sentence.md。')
    return stored


def lint(text, to='gpt'):
    errors = []
    first = text.splitlines()[0] if text else ''
    if not first.startswith('归类：') or '理由：' not in first:
        errors.append('第一行必须以「归类：」开头并含「理由：」。')
    if not re.search(r'^REPORT: /[^\n]+$', text, re.M):
        errors.append('缺少 REPORT: <绝对路径> 行。')
    if rule() not in text:
        errors.append('缺少逐字规则句。')
    if re.search(r'sk-[A-Za-z0-9_-]{16,}|Bearer\s+[A-Za-z0-9._~+/-]{20,}', text):
        errors.append('发现疑似密钥字面量（已隐藏）。')
    for line in text.splitlines():
        # 只检查启动命令；禁令和标明的错误示范是说明文字。
        if re.search(r'禁止|不加|不要|错误示范|绝不|不得', line):
            continue
        if re.search(r'(?:^|[\s`$;(])(?:fleet|fleet-go)\s+(?:code|copy|bulk|grok-cli|grok|haiku|sonnet|opus|fable|judge|run|new)\b|^\s*(?:\$\s*)?`?(?:nohup|node|npm|pnpm|python3?|bash|sh)\s+', line):
            if re.search(r'\b(?:nohup|setsid|disown)\b|(?<![&>])&(?![&\d])', line):
                errors.append('发现脱离启动命令；请使用工具 run_in_background。')
    if to in ('gpt', 'grok') and not all(word in text for word in ['授权覆盖', '允许读写', '禁止']):
        print('警告：GPT/Grok brief 缺少授权覆盖或允许读写/禁止小节。', file=sys.stderr)
    return errors


def checked(text, to):
    errors = lint(text, to)
    if errors:
        raise ValueError('\n'.join(errors))


def command(meta):
    to = meta['to']
    entry = {'gpt': 'code', 'claude': meta.get('tier') or 'sonnet', 'grok': 'grok-cli',
             'gemini': 'bulk' if meta.get('bulk') else 'copy', 'jev': 'judge'}[to]
    args = ['fleet', entry, meta['brief']]
    if to == 'jev':
        args.append(meta['questions'])
    args.extend(['--name', meta['name'], '--report', meta['report']])
    for option in ['review', 'low', 'subagents', 'expect-changes']:
        if meta.get(option):
            args.append('--' + option)
    if meta.get('model'):
        args.extend(['--model', meta['model']])
    return args


def launch(meta):
    """由 new/relaunch 前台替换为 fleet，保留完成通知和退出码。"""
    os.execvp('fleet', command(meta))


def running(active_only=True):
    """读取 fleet 控制面，重启核验需包含 stopped，不能把消失当停止成功。"""
    result = subprocess.run(['fleet', 'status', *(['--running'] if active_only else []), '--json'], capture_output=True, text=True)
    if result.returncode:
        raise ValueError(f'子命令 fleet status 失败：exit={result.returncode}。')
    rows = json.loads(result.stdout)
    if not isinstance(rows, list):
        raise ValueError('fleet status 返回格式不是数组。')
    return rows


def locate(name):
    matches = list((Path.home() / '.agent-reports').glob('*/' + name + '.brief.md'))
    if len(matches) != 1:
        raise ValueError('找不到唯一同名 brief，请换用唯一名称（跨日期重名也会歧义）。')
    path = matches[0]
    meta = json.loads(path.with_suffix('.json').read_text())
    if meta.get('to') not in PRODUCTS:
        raise ValueError('brief 元信息缺少有效 --to；请用 fleet-go new --to <产品> 创建新任务。')
    return path, meta


def gemini_check(text, expect_changes=False):
    """静态路由限制，只判断任务要求，不判断执行失败原因。"""
    classification = re.search(r'^归类[^\r\n]*', text, re.M)
    coding = r'编码|\bUI\b|前端实现|写代码|(?:修改|改动|改|编辑|重写|创建|新增|删除|更新).{0,12}(?:文件|代码|源码|组件|\S+\.(?:mjs|js|ts|tsx|jsx|py|html|css|json))|实现.{0,12}(?:界面|页面|功能)|(?:edit|modify|write|create|delete|update)\s+(?:\S+\s+){0,3}(?:files?|code|components?)|implement\s+(?:\S+\s+){0,3}(?:UI|code|component)'
    if expect_changes or (classification and re.search(r'编码|\bcode\b|\bUI\b|前端实现', classification[0], re.I)) or re.search(coding, text, re.I):
        raise ValueError('Gemini 只接文本任务，拒绝编码/UI/--expect-changes。')


def relaunch(name, to=None, tier=None):
    """复用既有 brief 元信息启动；amend 重启与独立 relaunch 共用此入口。"""
    path, meta = locate(name)
    matches = [r for r in running() if r.get('briefPath') == str(path) or r.get('name') == name]
    if matches:
        raise ValueError('同名任务仍未结束；需要重启请用 amend --restart，未重复派发。')
    target = to or meta['to']
    if tier and target != 'claude':
        raise ValueError('--tier 仅用于 --to claude。')
    text = path.read_text()
    if target == 'gemini':
        gemini_check(text.split('\n## 允许读写/禁止\n', 1)[0], meta.get('expect-changes', False))
    checked(text, target)
    if target != meta['to']:
        for option, products in [('tier', ['claude']), ('review', ['gpt', 'grok']),
                                 ('low', ['gpt']), ('model', ['grok']), ('subagents', ['grok']),
                                 ('bulk', ['gemini'])]:
            if target not in products:
                meta.pop(option, None)
    meta.update(to=target, name=name, brief=str(path))
    if tier:
        meta['tier'] = tier
    if target == 'jev' and not meta.get('questions'):
        meta['questions'] = str(path.with_suffix('.questions.json'))
        Path(meta['questions']).write_text(json.dumps({'decision': {'type': 'noul', 'instructions': text}}, ensure_ascii=False) + '\n')
    path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
    launch(meta)


def diagnostic_path(value):
    """错误提示只显示形似路径的输入，隐藏误传正文及疑似秘密。"""
    text = str(value)
    if re.search(r'\s|sk-[A-Za-z0-9_-]{16,}|[A-Za-z0-9_-]{32,}|(?:token|password|secret|key)=', text, re.I):
        return '[输入已隐藏]'
    if not (text.startswith(('/', '~/', './', '../')) or '/' in text or Path(text).suffix):
        return '[输入已隐藏]'
    return text


def residuals(run, path, name):
    """只观察唯一任务标记，返回 PID 和归属；cwd 不能区分相邻任务。"""
    result = subprocess.run(['pgrep', '-fl', 'codex exec|grok.*(-p|--prompt-file)'], capture_output=True, text=True)
    if result.returncode not in (0, 1):
        raise ValueError(f'子命令 pgrep 失败：exit={result.returncode}；已停止，未重派。')
    found = []
    for line in result.stdout.splitlines():
        parts = line.split(maxsplit=1)
        if len(parts) != 2 or not parts[0].isdigit():
            continue
        pid, cmdline = parts
        # ps 输出未保留 shell 引号；先在原始行识别 runId，不能因路径含引号漏掉。
        exact = bool(re.search(r'(?<![A-Za-z0-9_-])' + re.escape(run['runId']) + r'(?![A-Za-z0-9_-])', cmdline))
        try:
            tokens = shlex.split(line)
        except ValueError:
            tokens = line.split()
        exact = exact or (bool(run.get('resultPath')) and any(tokens[i:i + 2] == ['-o', run['resultPath']] for i in range(len(tokens) - 1)))
        related = str(path) in tokens or any(tokens[i:i + 2] == ['--name', name] for i in range(len(tokens) - 1))
        if exact or related:
            # 只输出识别依据，不打印任意参数，避免正文或秘密被带入诊断。
            summary = '编码执行器 [同一 runId]' if exact else '编码执行器 [brief/--name 匹配，参数已隐藏]'
            found.append((pid, exact, summary))
    return found


def restart(run, path, name):
    """amend 调用：等待本次停止；非 runId 明确归属的残留只告警，不误挡邻居。"""
    subprocess.run(['fleet', 'stop', run['runId']], check=True, capture_output=True, text=True)
    deadline = time.monotonic() + 60
    while True:
        row = next((r for r in running(False) if r['runId'] == run['runId']), None)
        stopped = row is not None and row.get('state', row.get('status')) == 'stopped'
        leftover = residuals(run, path, name)
        if stopped and not leftover:
            break
        if time.monotonic() >= deadline:
            for pid, _, summary in leftover:
                print(f'残留 PID={pid}：{summary}', file=sys.stderr)
            if not stopped:
                raise ValueError('fleet stop 后未确认 stopped 状态；修订已保留，未重派。')
            if any(exact for _, exact, _ in leftover):
                raise ValueError('同一 runId 进程仍有残留；修订已保留，未重派。')
            print('已确认 stopped，残留无法归属同一 runId，继续重新拉起。', file=sys.stderr)
            break
        time.sleep(0.5)
    relaunch(name)


def amend(args):
    """保留修订正文，按需插话或停止本次 run 后通过 relaunch 重启。"""
    path, meta = locate(args.name)
    original = path.read_text()
    if re.search(r'^## 【修订 \d+（[^\n]+）】\n' + re.escape(args.message) + r'(?=\n\n)', original, re.M):
        print('相同修订已存在，未重复插入。')
    else:
        numbers = [int(n) for n in re.findall(r'^## 【修订 (\d+)（', original, re.M)]
        lines = original.splitlines(keepends=True)
        stamp = datetime.datetime.now().isoformat(timespec='seconds')
        revised = ''.join(lines[:2]) + f'\n## 【修订 {max(numbers, default=0) + 1}（{stamp}）】\n{args.message}\n\n' + ''.join(lines[2:])
        checked(revised, meta['to'])
        path.write_text(revised)
        print(f'已修订：{path}', flush=True)
    if not args.say and not args.restart:
        return
    matches = [r for r in running() if r.get('state', r.get('status')) == 'running'
               and (r.get('briefPath') == str(path) or r.get('name') == args.name)]
    if len(matches) != 1:
        raise ValueError('找不到唯一运行中的 run；修订已保留，未发送或重启。')
    run = matches[0]
    if args.say:
        result = subprocess.run(['fleet', 'say', run['runId'], args.message], capture_output=True, text=True)
        if result.returncode:
            raise ValueError('fleet say 失败：' + result.stderr.strip() + '；修订已保留，未 stop、未重派。确需重来用 --restart。')
        if result.stdout.strip():
            print(result.stdout.strip())
        return
    restart(run, path, args.name)


def new(args):
    """组装标准 brief；预览不写盘，正文文件与 stdin 使用明确输入规则。"""
    for option, products in [('tier', ['claude']), ('review', ['gpt', 'grok']),
                             ('low', ['gpt']), ('model', ['grok']), ('subagents', ['grok']),
                             ('bulk', ['gemini'])]:
        if getattr(args, option) and args.to not in products:
            raise ValueError('--' + option + ' 仅用于 --to ' + '|'.join(products) + '。')
    if args.make == 'video' and args.to != 'grok':
        raise ValueError('--make video 仅用于 --to grok。')
    day = datetime.date.today().isoformat()
    folder = Path.home() / '.agent-reports' / day
    path = folder / (args.name + '.brief.md')
    if path.exists() and not args.dry_run:
        raise ValueError('同名 brief 已存在，拒绝覆盖；请用 amend 或换名。')
    report = str(Path(args.report).expanduser().absolute()) if args.report else str(folder / (args.name + '.md'))
    auth = args.auth.split(',')
    if any(a not in AUTH for a in auth):
        raise ValueError('未知授权块。可用：' + ','.join(AUTH))
    if 'paid' in auth and not args.budget:
        raise ValueError('paid 必须提供 --budget（上限与重试次数）。')
    pitfalls = args.pitfalls.split(',') if args.pitfalls is not None else (['node-proxy', 'zsh', 'secrets', 'shared-tree'] if args.to in ('gpt', 'grok') else ['secrets', 'fleet-bg'])
    if args.pitfalls is None and 'deploy-prod' in auth:
        pitfalls.append('pnpm-entry')
        pitfalls.extend(p.stem[8:] for p in BLOCKS.glob('pitfall-deploy-*.md'))
    if any(p not in PITFALLS and not (BLOCKS / ('pitfall-' + p + '.md')).exists() for p in pitfalls if p):
        raise ValueError('未知已知坑块。')
    values = {'NAME': args.name, 'REPORT': report, 'BUDGET': args.budget or '未授权付费', 'DATE': day}
    if args.body and args.body != '-':
        body_path = Path(args.body).expanduser()
        if not body_path.is_file():
            raise ValueError(f'--body 不是文件路径：{diagnostic_path(body_path)}；--body 需要文件路径，用 - 读取 stdin。')
        body = body_path.read_text()
    else:
        body = sys.stdin.read() if args.body == '-' or not sys.stdin.isatty() else ''
    if not args.goal and not body.strip():
        raise ValueError('请提供 --goal、--body 或 stdin 正文。')
    if args.to == 'gemini':
        gemini_check('\n'.join([args.goal or '', body, args.why or '']), args.expect_changes)
    classification = PRODUCTS[args.to] + (' 只读复核' if args.review else '')
    if args.to == 'claude':
        classification += ' ' + (args.tier or 'sonnet')
    parts = [f'归类：{classification}；理由：{args.why or classification + "任务，按既有路由执行"}\nREPORT: {report}', block('style-sol', values),
             '## 授权覆盖\n' + '\n\n'.join(block('auth-' + a, values) for a in dict.fromkeys(auth))]
    if args.goal:
        parts.append('## 目标\n' + args.goal)
    if body.strip():
        parts.append(body.strip())
    if args.make:
        parts.append('## 产物要求\n' + block('make-' + args.make, {'OUTDIR': '/tmp/' + args.name + '/'}))
        if args.make == 'image':
            parts.append('执行方法：' + ('使用 imagegen Skill 和 Codex 内置 image_gen 工具。' if args.to == 'gpt' else 'Grok 使用内置 image_gen / image_edit 工具，无 model 参数。' if args.to == 'grok' else '使用当前产品可用的真实图片生成工具，不能生成则如实报告。'))
    writes = [report, '/tmp/' + args.name + '/', *(args.write or [])]
    parts.append('## 允许读写/禁止\n允许写：\n' + '\n'.join('- ' + p for p in dict.fromkeys(writes)) + '\n只读：\n' + '\n'.join('- ' + p for p in (args.read or [])) + '\n禁止：' + (args.forbid or '越界、未授权部署、提交/推送、付费、打印密钥。'))
    parts.append('## 已知坑\n' + '\n\n'.join(block('pitfall-' + p, values) for p in dict.fromkeys(pitfalls) if p))
    parts.extend(['## 验收\n' + block('accept-boilerplate', values) + '\n\n' + block('report-template', values), rule()])
    text = '\n\n'.join(parts) + '\n'
    checked(text, args.to)
    meta = {'to': args.to, 'name': args.name, 'brief': str(path), 'report': report,
            'tier': args.tier, 'review': args.review, 'low': args.low, 'model': args.model,
            'subagents': args.subagents, 'bulk': args.bulk, 'expect-changes': args.expect_changes}
    if args.to == 'jev':
        meta['questions'] = str(path.with_suffix('.questions.json'))
    if args.dry_run:
        print(text, end='')
        print('\n将执行：' + shlex.join(command(meta)), file=sys.stderr)
        return
    folder.mkdir(parents=True, exist_ok=True)
    with path.open('x') as file:
        file.write(text)
    if args.to == 'jev':
        Path(meta['questions']).write_text(json.dumps({'decision': {'type': 'noul', 'instructions': args.goal or body.strip()}}, ensure_ascii=False) + '\n')
    path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
    if args.no_launch:
        print(f'已生成：{path}')
    else:
        launch(meta)


def main():
    """解析公开命令入口；状态默认仅保留非终态及最近一小时。"""
    parser = argparse.ArgumentParser(description='fleet-go：短参数组装标准 brief；前台执行 fleet。')
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('new')
    p.add_argument('name')
    p.add_argument('--to', choices=PRODUCTS, required=True)
    p.add_argument('--tier', choices=['haiku', 'sonnet', 'opus', 'fable'])
    p.add_argument('--model')
    p.add_argument('--make', choices=['image', 'video'])
    for option in ['review', 'low', 'subagents', 'bulk', 'expect-changes']:
        p.add_argument('--' + option, action='store_true')
    for option in ['why', 'goal', 'body', 'budget', 'forbid', 'pitfalls', 'report']:
        p.add_argument('--' + option)
    p.add_argument('--auth', default='local')
    for option in ['write', 'read']:
        p.add_argument('--' + option, nargs='+', action='extend')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--dry-run', action='store_true')
    group.add_argument('--no-launch', action='store_true')
    p = sub.add_parser('amend')
    p.add_argument('name')
    p.add_argument('message')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--say', action='store_true')
    group.add_argument('--restart', action='store_true')
    p = sub.add_parser('relaunch')
    p.add_argument('name')
    p.add_argument('--to', choices=PRODUCTS)
    p.add_argument('--tier', choices=['haiku', 'sonnet', 'opus', 'fable'])
    p = sub.add_parser('lint')
    p.add_argument('brief')
    p.add_argument('--to', choices=PRODUCTS, default='gpt')
    sub.add_parser('team')
    p = sub.add_parser('status')
    p.add_argument('--all', action='store_true')
    if any(a == '--kind' or a.startswith('--kind=') for a in sys.argv[1:]):
        raise ValueError('请使用 --to gpt|claude|grok|gemini|jev。')
    args = parser.parse_args()
    if hasattr(args, 'name') and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', args.name):
        raise ValueError('名称只能包含字母、数字、下划线与连字符。')
    if args.action == 'new':
        new(args)
    elif args.action == 'amend':
        amend(args)
    elif args.action == 'relaunch':
        relaunch(args.name, args.to, args.tier)
    elif args.action == 'team':
        os.execvp('fleet', ['fleet', 'team'])
    elif args.action == 'lint':
        checked(Path(args.brief).read_text(), args.to)
        print('lint 通过。')
    else:
        rows = running(False)
        # fleet status 只返回最近 24 小时；补入本地已结束的历史记录。
        folder = Path(os.environ.get('AGENT_FLEET_RUNS_DIR', Path.home() / '.agent-fleet/runs'))
        known = {r['runId'] for r in rows}
        for path in sorted(folder.glob('*.json'), key=lambda p: p.name.endswith('.pid.json')):
            rec = json.loads(path.read_text())
            if path.name.endswith('.pid.json'):
                run_id = path.name[:-len('.pid.json')]
                if not rec.get('finished'):
                    continue
                # shortcut: 前台记录可能未存结束时间，以终态写盘时间近似；持久化补齐后改用字段。
                finished_at = rec.get('finishedAt') or datetime.datetime.fromtimestamp(path.stat().st_mtime, datetime.timezone.utc).isoformat()
                existing = next((r for r in rows if r['runId'] == run_id), None)
                if existing:
                    existing.setdefault('finishedAt', finished_at)
                if any(run_id == k or run_id.startswith(k + '-task-') for k in known):
                    continue
                rec['finishedAt'] = finished_at
                # 前台历史无 status 字段，沿用 fleet 的日志终态判定。
                log = Path(rec['logPath']).read_text() if rec.get('logPath') and Path(rec['logPath']).exists() else ''
                rec.update(runId=run_id, status='failed' if re.search(r'\] done error', log) else 'done')
            if rec.get('runId') not in known and rec.get('status') in ('done', 'failed', 'stopped'):
                rows.append(rec)
                known.add(rec['runId'])
        if not args.all:
            cutoff = datetime.datetime.now(datetime.timezone.utc).timestamp() - 3600
            selected = []
            for r in rows:
                stamp = r.get('finishedAt') or r.get('startedAt')
                recent = stamp and datetime.datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp() >= cutoff
                if r.get('state', r.get('status')) not in ('done', 'failed', 'stopped') or recent:
                    selected.append(r)
            rows = selected
        rows.sort(key=lambda r: r.get('startedAt') or '', reverse=True)
        for r in rows:
            warning = '⚠ ' if r.get('launchDetached') else ''
            print(f"{warning}{r['runId'][-16:]} {r.get('status', '?')} {r.get('duration', '?')} {Path(r.get('briefPath') or r.get('name') or '?').name} {r.get('model', '?')}")
            if warning:
                print('请用 fleet wait ' + r['runId'] + ' 挂上通知。')
        if not rows:
            print('没有符合筛选条件的任务。')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        # 不回显正文、命令参数或状态内容，避免错误输出带出秘密。
        if isinstance(error, ValueError):
            message = str(error)
        elif isinstance(error, OSError):
            message = f'路径/子命令 {error.filename if error.filename in ("fleet", "pgrep") else diagnostic_path(error.filename) if error.filename else "未知"}：{errno.errorcode.get(error.errno, "OSError")}。'
        else:
            cmd = getattr(error, 'cmd', None)
            executable = Path(cmd[0]).name if isinstance(cmd, (list, tuple)) and cmd else '未知'
            message = f'子命令 {executable}：{type(error).__name__} exit={getattr(error, "returncode", "未知")}。'
        print('错误：' + message, file=sys.stderr)
        sys.exit(1)
