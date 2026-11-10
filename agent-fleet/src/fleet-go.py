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
import unicodedata
import mini

BLOCKS = Path(__file__).resolve().parents[1] / 'skill/templates/blocks'
LEGACY_RULE = "禁止单纯转发，允许分发子步骤：不能把整个任务原样甩给另一个 agent 后只回'已启动/等结果'就结束当轮；可以拆出边界清晰的子步骤交给更便宜的 agent 做，但你必须自己掌握全局、消化并验证子任务结果，最终给出真正的结论作为你的最终答案"
PRODUCTS = {'gpt': '(a) Codex 编码', 'claude': 'Claude 月度额度', 'openai': 'OpenAI 月度API额度',
            'grok': 'Grok Build CLI', 'gemini': 'Gemini 文本任务', 'jev': 'JEV 判断'}
AUTH = ['local', 'local-commit', 'readonly-web', 'deploy-prod', 'paid', 'review']
PITFALLS = ['node-proxy', 'zsh', 'pnpm-entry', 'local-preview', 'playwright-clean', 'shared-tree', 'secrets', 'fleet-bg', 'ssr-check']

EARLY_RULE = "你是这单的负责人，自己掌握全局；可以把边界清晰的子步骤交给更便宜的 agent，并消化、验证它们的结果，最终给出真正的结论作为你的最终答案。"


def block(name, values=None):
    text = (BLOCKS / (name + '.md')).read_text().strip()
    for key, value in (values or {}).items():
        text = text.replace('{' + key + '}', value)
    return text


def rule():
    stored = block('rule-sentence')
    source = Path.home() / '.claude/CLAUDE.md'
    if source.exists():
        text = source.read_text()
        if stored not in text and LEGACY_RULE not in text:
            raise ValueError('请同步 ~/.claude/CLAUDE.md 与 rule-sentence.md 的负责人规则句。')
    return stored


def repository_roots(paths, on):
    paths = list(dict.fromkeys(paths))
    if len(paths) < 2: return set()
    script = """import base64,json,pathlib,sys
p=json.loads(base64.b64decode(sys.argv[1])); roots=[]
for value in p['paths']:
 path=pathlib.Path(value).resolve()
 for parent in (path,*path.parents):
  if (parent/'.git').exists(): roots.append(str(parent)); break
print(json.dumps(sorted(set(roots))))
"""
    if on == 'mini':
        result = mini.call(script, {'paths': [mini.remote_path(p) for p in paths]})
        if result.returncode: raise ValueError('无法核验跨仓库路径，请改用 Sol。')
        return set(json.loads(result.stdout))
    roots = set()
    for value in paths:
        path = Path(value).resolve()
        for parent in (path, *path.parents):
            if (parent / '.git').exists():
                roots.add(str(parent))
                break
    return roots


def lint(text, to='gpt', simple=False, on='local', extra=True):
    errors = []
    first = text.splitlines()[0] if text else ''
    if not first.startswith('归类：') or '理由：' not in first:
        errors.append('第一行必须以「归类：」开头并含「理由：」。')
    if not re.search(r'^REPORT: /[^\n]+$', text, re.M):
        errors.append('缺少 REPORT: <绝对路径> 行。')
    if rule() not in text and LEGACY_RULE not in text and EARLY_RULE not in text:
        errors.append('缺少逐字规则句。')
    secret_rules = [
        ('sk-token', r'(?<![A-Za-z0-9_/.-])sk-[A-Za-z0-9_-]{16,}(?![A-Za-z0-9_/-]|\.[A-Za-z0-9])'),
        ('aws-access-key-id', r'(?<![A-Za-z0-9])AKIA[A-Z0-9]{16}(?![A-Za-z0-9])'),
        ('bearer-token', r'(?i:Bearer)\s+[A-Za-z0-9._~+/-]{20,}'),
        ('private-key', r'-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----'),
        ('credential-assignment', r'''(?i:\b(?:api[_-]?key|access[_-]?key|token|password|secret|key)\s*=\s*)["']?[A-Za-z0-9_+/-]{20,}={0,2}'''),
    ]
    for name, pattern in secret_rules:
        for match in re.finditer(pattern, text):
            number = text.count('\n', 0, match.start()) + 1
            errors.append(f'第 {number} 行：发现疑似密钥字面量；规则 {name}（已隐藏）。')
    for line in text.splitlines():
        # 只检查启动命令；禁令和标明的错误示范是说明文字。
        if re.search(r'禁止|不加|不要|错误示范|绝不|不得', line):
            continue
        if re.search(r'(?:^|[\s`$;(])(?:fleet|fleet-go)\s+(?:code|copy|bulk|grok-cli|grok|openai|haiku|sonnet|opus|fable|judge|run|new)\b|^\s*(?:\$\s*)?`?(?:nohup|node|npm|pnpm|python3?|bash|sh)\s+', line):
            if re.search(r'\b(?:nohup|setsid|disown)\b|(?<![&>])&(?![&\d])', line):
                errors.append('发现脱离启动命令；请使用工具 run_in_background。')
    if to in ('gpt', 'grok') and not all(word in text for word in ['授权覆盖', '允许范围']):
        print('警告：GPT/Grok brief 请补齐授权覆盖与允许范围小节。', file=sys.stderr)
    if extra:
        action_match = re.search(r'^动作[ \t]*[:：][ \t]*(.*?)[ \t]*$', text, re.M)
        entry_match = re.search(r'^##?\s*入口\s*[:：]?\s*\n(.*?)(?=^##?\s|\Z)', text, re.M | re.S)
        entry = entry_match.group(1) if entry_match else ''
        if not action_match:
            print('警告：缺少动作行；过渡期暂不拦截入口与授权检查。', file=sys.stderr)
        else:
            actions = {re.sub(r'[（(].*?[）)]', '', v).strip() for v in action_match.group(1).split('/')}
            valid = {'只读', '改代码', '本地提交', '推送', '部署', '付费'}
            auth_match = re.search(r'^## 授权覆盖\s*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
            auth_text = auth_match.group(1) if auth_match else ''
            local = '本地文件修改、构建与预览' in auth_text or bool(re.search(r'^授权块：.*(?<![\w-])local(?![\w-])', auth_text, re.M))
            commit = '允许在本地分支提交' in auth_text or '允许本地提交' in auth_text or bool(re.search(r'^授权块：.*\blocal-commit\b', auth_text, re.M))
            deploy = '发布全流程' in auth_text or bool(re.search(r'^授权块：.*\bdeploy-prod\b', auth_text, re.M))
            paid = '当前目标必要的付费验证' in auth_text or bool(re.search(r'^授权块：.*\bpaid\b', auth_text, re.M))
            if not actions <= valid:
                errors.append('动作行含未知或空动作。')
            if '改代码' in actions and not (local or commit):
                errors.append('改代码需要 local 或 local-commit 授权。')
            if '本地提交' in actions and not commit:
                errors.append('本地提交需要 local-commit 授权。')
            if actions & {'推送', '部署'} and not (commit and deploy):
                errors.append('推送或部署需要 local-commit 和 deploy-prod 授权。')
            if '付费' in actions and not paid:
                errors.append('付费需要 paid 授权。')
            repo = re.search(r'^[ \t]*仓库[ \t]*[:：][ \t]*([^\s，,；;（(]+)', entry, re.M)
            if not repo:
                errors.append('入口缺少仓库绝对路径。')
            else:
                repo_path = repo.group(1).strip('`')
                if not repo_path.startswith('/'):
                    errors.append('入口仓库需要绝对路径。')
                elif on == 'mini':
                    try:
                        result = mini.call("import base64,json,os,pathlib,sys; p=json.loads(base64.b64decode(sys.argv[1]))\n" + mini.CANONICAL_SCRIPT + "\nprint(int(os.path.isdir(canonical(p['path']))))", {'path': mini.remote_path(repo_path), 'home': mini.REMOTE_HOME})
                        if result.returncode or result.stdout.strip() not in ('0', '1'):
                            print('警告：无法校验执行机器上的入口仓库。', file=sys.stderr)
                        elif result.stdout.strip() == '0': errors.append('执行机器上的入口仓库不存在。')
                    except (OSError, subprocess.SubprocessError):
                        print('警告：无法校验执行机器上的入口仓库。', file=sys.stderr)
                elif not Path(repo_path).is_dir(): errors.append('执行机器上的入口仓库不存在。')
            if actions - {'只读'} and not re.search(r'^[ \t]*可写路径[ \t]*[:：][ \t]*/[^\s（(]*', entry, re.M):
                errors.append('入口缺少可写路径。')
        if simple and re.search(r'未知|自己找', entry):
            errors.append('入口未知或自己找时不能使用 --simple。')
        if simple:
            writes = re.findall(r'^[ \t]*可写路径[ \t]*[:：][ \t]*(/[^\s，,；;（(]+)', entry, re.M)
            allowed = re.search(r'^## 允许范围\s*\n允许写：\n(.*?)(?=^只读：|^## |\Z)', text, re.M | re.S)
            if allowed:
                writes.extend(re.findall(r'^- (/[^\n]+)$', allowed.group(1), re.M))
            if len(repository_roots(writes, on)) >= 2:
                errors.append('--simple 可写路径跨两个或以上仓库，请改用 Sol（移除 --simple）。')
            goal = re.search(r'^## 目标\s*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
            if goal and re.search(r'打通|接入|跨服务', goal.group(1)):
                files = re.findall(r'(?:^|[\s:：、,，`])((?:/|\.?\.?/)?[\w@./-]+\.[A-Za-z][A-Za-z0-9]*)(?=$|[\s、,，`）)])', entry, re.M)
                repo_match = re.search(r'仓库[ \t]*[:：][ \t]*(/[^\s，,；;（(]+)', entry)
                repo_path = repo_match.group(1) if repo_match else '/'
                concrete = [os.path.normpath(f if f.startswith('/') else os.path.join(repo_path, f)) for f in files]
                object_match = re.search(r'^对象: (.+)$', text, re.M)
                if object_match:
                    # Generated scope starts with the report and task scratch directory.
                    scoped = [*re.findall(r'^[ \t]*可写路径[ \t]*[:：][ \t]*(/[^\s，,；;（(]+)', entry, re.M),
                              *json.loads(object_match.group(1)).get('writes', []),
                              *(re.findall(r'^- (/[^\n]+)$', allowed.group(1), re.M)[2:] if allowed else [])]
                else:
                    report = re.search(r'^REPORT: (.+)$', text, re.M)
                    outputs = {report.group(1), '/tmp/' + Path(report.group(1)).stem + '/'} if report else set()
                    scoped = [p for p in writes if p not in outputs]
                if not concrete or any(not any(f == w.rstrip('/') or f.startswith(w.rstrip('/') + '/') for f in concrete) for w in scoped):
                    errors.append('--simple 的跨服务目标入口未列全具体文件，请改用 Sol（移除 --simple）或补齐入口文件。')
        if errors:
            errors.append('示例（按实际任务和授权修改）：\n动作: 改代码 / 本地提交\n## 入口\n仓库: /tmp\n可写路径: /tmp/example\n## 授权覆盖\n授权块：local-commit')
    return errors


def checked(text, to, simple=False, on='local', extra=False):
    errors = lint(text, to, simple, on, extra)
    if errors:
        raise ValueError('\n'.join(errors))


def command(meta):
    to = meta['to']
    entry = {'gpt': 'code', 'openai': 'openai', 'claude': meta.get('tier') or 'sonnet', 'grok': 'grok-cli',
             'gemini': 'bulk' if meta.get('bulk') else 'copy', 'jev': 'judge'}[to]
    args = ['fleet', entry, meta['brief']]
    if to == 'jev':
        args.append(meta['questions'])
    args.extend(['--name', meta['name'], '--report', meta['report']])
    for option in ['review', 'low', 'high', 'xhigh', 'max', 'simple', 'sol', 'luna', 'fast', 'no-fast', 'subagents', 'expect-changes']:
        if meta.get(option):
            args.append('--' + option)
    if meta.get('model'):
        args.extend(['--model', meta['model']])
    return args


def launch(meta):
    """由 new/relaunch 前台替换为 fleet，保留完成通知和退出码。"""
    location = meta.get('on') or os.environ.get('FLEET_DEFAULT_ON', 'mini')
    if location == 'local':
        os.execvp('fleet', command(meta))
    brief = Path(meta['brief'])
    previous = brief.read_text()
    cleaned = re.sub(r'^(?:警告：)?Mini .+，已在 MacBook 执行\n', '', previous, flags=re.M)
    if cleaned != previous: brief.write_text(cleaned)
    if location not in ('mini', 'local'):
        raise ValueError('FLEET_DEFAULT_ON 只能是 mini 或 local。')
    reason = None
    if location == 'mini':
        if not mini.available():
            reason = 'Mini 不可达'
        else:
            reason = mini.preflight(meta, meta.get('paths', []))
    reachable = location == 'mini' and not reason
    meta['execution'] = 'mini' if reachable else ('failed' if meta.get('on') == 'mini' else 'local')
    Path(meta['brief']).with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
    if reachable:
        sys.exit(mini.launch(meta, command(meta)))
    if location == 'mini' and meta.get('on') == 'mini':
        raise ValueError(reason + '；显式指定 --on mini，未回退。')
    if location == 'mini':
        marker = '警告：' + reason + '，已在 MacBook 执行'
        path = Path(meta['brief'])
        text = path.read_text()
        if marker not in text:
            lines = text.splitlines(keepends=True)
            path.write_text(''.join(lines[:2]) + '\n' + marker + '\n' + ''.join(lines[2:]))
        print(marker, flush=True)
        code = subprocess.run(command(meta), env={**os.environ, 'FLEET_FALLBACK_WARNING': marker}).returncode
        report = Path(meta['report'])
        if report.exists():
            with report.open('a') as f: f.write('\n' + marker + '\n')
        sys.exit(code)
    os.execvp('fleet', command(meta))


def running(active_only=True):
    """读取 fleet 控制面，重启核验需包含 stopped，不能把消失当停止成功。"""
    result = subprocess.run(['fleet', 'status', *(['--running'] if active_only else []), '--json'], capture_output=True, text=True)
    if result.returncode:
        raise ValueError(f'子命令 fleet status 失败：exit={result.returncode}。')
    rows = json.loads(result.stdout)
    if not isinstance(rows, list):
        raise ValueError('fleet status 返回格式不是数组。')
    for rec in mini.records():
        try:
            row = mini.query(rec)
            row['briefPath'] = rec['brief']
            row['name'] = rec['name']
            row['state'] = row.get('status')
            row['location'] = 'mini'
            if not active_only or row.get('status') in ('running', 'queued', 'parked', 'waiting', 'abnormal'): rows.append(row)
        except (OSError, subprocess.SubprocessError, ValueError, ConnectionError):
            rows.append({'runId': rec['id'], 'name': rec['name'], 'briefPath': rec['brief'], 'status': 'unreachable', 'state': 'running', 'location': 'mini'})
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


def relaunch(name, to=None, tier=None, simple=False, fast=False, no_fast=False, luna=False, high=False, xhigh=False, max=False, low=False, on=None, pull=False):
    """复用既有 brief 元信息启动；amend 重启与独立 relaunch 共用此入口。"""
    path, meta = locate(name)
    matches = [r for r in running() if r.get('briefPath') == str(path) or r.get('name') == name]
    if matches:
        raise ValueError('同名任务仍未结束；需要重启请用 amend --restart，未重复派发。')
    target = to or meta['to']
    if target == 'claude' and (tier or (meta.get('tier') if meta['to'] == 'claude' else None)) == 'fable':
        raise ValueError('Fable 只用 executor-fable 子代理派单（Agent 工具，subagent_type=executor-fable）')
    if tier and target != 'claude':
        raise ValueError('--tier 仅用于 --to claude。')
    if simple and target != 'gpt':
        raise ValueError('--simple 仅用于 --to gpt。')
    selected_luna = luna or (not simple and target == 'gpt' and meta.get('luna'))
    selected_simple = simple or (not luna and target == 'gpt' and meta.get('simple'))
    if selected_luna and target != 'gpt':
        raise ValueError('--luna 仅用于 --to gpt。')
    if selected_luna and meta.get('review'):
        raise ValueError('--luna 不能与 --review 同用。')
    if selected_luna and selected_simple:
        raise ValueError('--luna 不能与 --simple 同用。')
    if sum([low, high, xhigh, max]) > 1:
        raise ValueError('--low、--high、--xhigh 和 --max 不能同用。')
    if max and target != 'gpt':
        raise ValueError('--max 仅用于 --to gpt。')
    if target == 'gpt' and (xhigh or max) and not selected_luna:
        raise ValueError('--xhigh 和 --max 仅用于 --luna。')
    if fast and target != 'gpt':
        raise ValueError('--fast 仅用于 --to gpt。')
    if (low or high or xhigh) and target not in ('gpt', 'gemini'):
        raise ValueError('--low、--high 和 --xhigh 仅用于 --to gpt|gemini。')
    text = path.read_text()
    scope = text.split('## 目标', 1)[-1].split('## 允许范围', 1)[0] if 'paths' not in meta else ''
    revisions = '\n'.join(re.findall(r'^## 【修订 [^\n]+】\n(.*?)(?=\n\n)', text, re.M | re.S))
    allowed = text.split('## 允许范围', 1)[-1].split('## 已知坑', 1)[0]
    declared = [p for p in mini.referenced_paths('\n'.join(line for line in allowed.splitlines() if line.startswith('- ')))
                if p not in (meta['report'], '/tmp/' + name + '/')]
    meta['paths'] = list(dict.fromkeys([*meta.get('paths', []), *mini.referenced_paths(scope), *mini.referenced_paths(revisions), *declared]))
    checked(text, target, bool(selected_simple or (target == 'gpt' and meta.get('review') and not meta.get('sol'))), on or meta.get('on') or os.environ.get('FLEET_DEFAULT_ON', 'mini'), True)
    if target != meta['to']:
        for option, products in [('tier', ['claude']), ('review', ['gpt', 'grok']),
                                 ('low', ['gpt', 'gemini']), ('high', ['gpt', 'gemini']), ('xhigh', ['gpt', 'gemini']), ('max', ['gpt']), ('simple', ['gpt']), ('sol', ['gpt']), ('luna', ['gpt']), ('fast', ['gpt']), ('no-fast', ['gpt']), ('model', ['grok']), ('subagents', ['grok']),
                                 ('bulk', ['gemini'])]:
            if target not in products:
                meta.pop(option, None)
        if target == 'gpt' and not selected_luna:
            meta.pop('xhigh', None)
            meta.pop('max', None)
    meta.update(to=target, name=name, brief=str(path))
    if on is not None: meta['on'] = on
    meta['pull'] = pull
    if tier:
        meta['tier'] = tier
    if simple:
        meta['simple'], meta['luna'], meta['sol'] = True, False, False
        if not (low or high or xhigh or max):
            meta['xhigh'] = meta['max'] = False
    if luna:
        meta['luna'], meta['simple'], meta['sol'] = True, False, False
    if low:
        meta['low'] = True
        meta['high'] = meta['xhigh'] = meta['max'] = False
    if high:
        meta['low'] = False
        meta['high'] = True
        meta['xhigh'] = False
        meta['max'] = False
    if xhigh:
        meta['low'] = False
        meta['high'] = False
        meta['xhigh'] = True
        meta['max'] = False
    if max:
        meta['low'] = False
        meta['high'] = False
        meta['xhigh'] = False
        meta['max'] = True
    if target == 'gemini' and not (meta.get('low') or meta.get('high') or meta.get('xhigh')):
        meta['xhigh'] = True
    if fast:
        meta['fast'] = True
    if no_fast:
        meta['no-fast'] = True
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
    if args.simple or args.luna or args.low or args.high or args.xhigh or args.max:
        if (args.simple or args.luna or args.max) and meta['to'] != 'gpt':
            raise ValueError('--simple、--luna 和 --max 仅用于 --to gpt。')
        if (args.low or args.high or args.xhigh) and meta['to'] not in ('gpt', 'gemini'):
            raise ValueError('--low、--high 和 --xhigh 仅用于 --to gpt|gemini。')
        if (args.luna and meta.get('review')) or (args.luna and args.simple):
            raise ValueError('--luna 和 --simple 不能同用，也不能与 --review 同用。')
        if sum([args.low, args.high, args.xhigh, args.max]) > 1:
            raise ValueError('--low、--high、--xhigh 和 --max 不能同用。')
        if meta['to'] == 'gpt' and (args.xhigh or args.max) and not (args.luna or (not args.simple and meta.get('luna'))):
            raise ValueError('--xhigh 和 --max 仅用于 --luna。')
        if args.simple:
            meta['simple'], meta['luna'], meta['sol'] = True, False, False
            if not (args.low or args.high or args.xhigh or args.max):
                meta['xhigh'] = meta['max'] = False
        if args.luna:
            meta['luna'], meta['simple'], meta['sol'] = True, False, False
        if args.low:
            meta['low'] = True
            meta['high'] = meta['xhigh'] = meta['max'] = False
        if args.high:
            meta['low'] = False
            meta['high'] = True
            meta['xhigh'] = False
            meta['max'] = False
        if args.xhigh:
            meta['low'] = False
            meta['high'] = False
            meta['xhigh'] = True
            meta['max'] = False
        if args.max:
            meta['low'] = False
            meta['high'] = False
            meta['xhigh'] = False
            meta['max'] = True
        path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
    if args.on is not None:
        meta['on'] = args.on
        path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
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
    remote = mini.find(args.name) if meta.get('execution') == 'mini' else None
    if remote and not remote.get('local'):
        remote_brief = mini.remote_path(str(path))
        script = '''import base64,json,pathlib,sys
p=json.loads(base64.b64decode(sys.argv[1]))
''' + mini.CANONICAL_SCRIPT + '''
pathlib.Path(canonical(p['path'])).write_text(canonical(p['text']))
'''
        res = mini.call(script, {'path': remote_brief, 'text': mini.rewrite_brief(path.read_text()), 'home': mini.REMOTE_HOME})
        if res.returncode: raise ValueError('Mini 修订同步失败。')
        if args.say:
            if mini.query(remote).get('status') not in ('running', 'waiting', 'abnormal'):
                print('没有运行中的 run：按修订后的 brief 直接 relaunch。', flush=True)
                relaunch(args.name, on=args.on or meta.get('on'))
            sys.exit(mini.forward(['say', remote['id'], args.message]))
        if args.restart:
            if mini.forward(['stop', remote['id']]): raise ValueError('Mini 停止失败。')
            relaunch(args.name, on=args.on or meta.get('on'))
        return
    if not args.say and not args.restart:
        return
    matches = [r for r in running() if r.get('state', r.get('status')) in ('running', 'waiting')
               and (r.get('briefPath') == str(path) or r.get('name') == args.name)]
    if not matches and args.say:
        # 上一轮已结束（常见：部分完成后交回）：修订已写入 brief，直接按修订后的 brief 续派，省掉单独 relaunch
        print('没有运行中的 run：按修订后的 brief 直接 relaunch。', flush=True)
        relaunch(args.name)
        return
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


def level_arg(value):
    """难度档 L1–L4，也接受 1–4，统一存成 L1–L4。"""
    match = re.fullmatch(r'[Ll]?([1-4])', value)
    if not match:
        raise argparse.ArgumentTypeError('难度档只能是 L1–L4。')
    return 'L' + match.group(1)


NONCAP = [('quota', '额度'), ('capacity', '容量/429'), ('zombie', '僵尸'), ('stopped', '被停'), ('auth-gateway', '鉴权/网关')]
MIN_SAMPLE = 8


def ledger_rows():
    """读账本 ~/.agent-fleet/ledger.jsonl（环境变量 AGENT_FLEET_LEDGER 可改路径）；坏行跳过。"""
    path = Path(os.environ.get('AGENT_FLEET_LEDGER') or Path.home() / '.agent-fleet/ledger.jsonl')
    if not path.exists():
        raise ValueError(f'账本不存在：{path}。先运行 bin/fleet-ledger-backfill.mjs 回填，或等新任务结束自动写入。')
    rows = []
    for line in path.read_text().splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            pass
    return path, rows


def cells(rows):
    """按显示宽度对齐中文表格。"""
    def width(text):
        return sum(2 if unicodedata.east_asian_width(c) in 'WF' else 1 for c in text)
    sizes = [max(width(str(row[i])) for row in rows) for i in range(len(rows[0]))]
    return '\n'.join('  '.join(str(cell) + ' ' * (sizes[i] - width(str(cell))) for i, cell in enumerate(row)).rstrip() for row in rows)


def mean_text(values):
    return f'{sum(values) / len(values):.2f} (n={len(values)})' if values else '-'


def score(args):
    """只读账本，按执行者给出计数；不设总分权重。样本少于 8 的标「样本不足」。"""
    path, rows = ledger_rows()
    total_rows = len(rows)
    if args.since:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', args.since):
            raise ValueError('--since 需要 YYYY-MM-DD。')
        rows = [r for r in rows if (r.get('date') or '') >= args.since]
    makers = [r for r in rows if r.get('type') != 'review']
    checkers = [r for r in rows if r.get('type') == 'review']
    # 复核单 -> 被复核的那次做活 run：同名、更早开始、取最近一次。
    by_name = {}
    for r in sorted(makers, key=lambda r: r.get('startedAt') or ''):
        by_name.setdefault(r['name'], []).append(r)
    linked = {}
    for review in checkers:
        earlier = [m for m in by_name.get(review.get('reviewOf'), []) if (m.get('startedAt') or '') < (review.get('startedAt') or '')]
        if earlier:
            linked.setdefault(earlier[-1]['runId'], []).append(review)
    print(f"账本 {path}：共 {total_rows} 行；统计范围 {'自 ' + args.since + ' 起' if args.since else '全部'}，{len(rows)} 行（其中回填 {sum(1 for r in rows if r.get('backfilled'))} 行）。")
    print('剔除的非能力因素：额度、容量/429、僵尸、被停、鉴权/网关，不计入真完成/部分/失败；样本 = 运行数 - 剔除数；少于 %d 标「样本不足」。' % MIN_SAMPLE)
    for title, group in [('做活（非复核）', makers), ('复核者', checkers)]:
        if not group:
            continue
        head = ['执行者', '运行(任务)', '样本', '真完成', '部分', '失败'] + ['剔除' + label for _, label in NONCAP]
        head += ['被复核(次)', '必修项均值'] if group is makers else ['有尾注', 'pass/fail/partial', '必修项均值']
        table = [head + ['备注']]
        for name in sorted({r.get('executor') or 'unknown' for r in group}):
            mine = [r for r in group if (r.get('executor') or 'unknown') == name]
            dropped = {k: sum(1 for r in mine if r.get('failure') == k) for k, _ in NONCAP}
            kept = [r for r in mine if r.get('failure') not in dropped]
            count = lambda o: sum(1 for r in kept if r.get('outcome') == o)
            line = [name, f"{len(mine)}({len({r['name'] for r in mine})})", len(kept), count('complete'), count('partial'), count('failed')]
            line += [dropped[k] for k, _ in NONCAP]
            if group is makers:
                reviews = [rv for r in mine for rv in linked.get(r['runId'], [])]
                counted = [rv['blockers'] for rv in reviews if rv.get('blockers') is not None]
                line += [f"{sum(1 for r in mine if r['runId'] in linked)}({len(reviews)})", mean_text(counted)]
            else:
                trailers = [r for r in mine if r.get('blockers') is not None]
                verdicts = [sum(1 for r in trailers if r.get('reviewVerdict') == v) for v in ('pass', 'fail', 'partial')]
                line += [len(trailers), '/'.join(map(str, verdicts)), mean_text([r['blockers'] for r in trailers])]
            line.append('样本不足' if len(kept) < MIN_SAMPLE else '')
            table.append(line)
        print(f'\n{title}\n' + cells(table))
    if checkers:
        paired = sum(1 for r in checkers if r.get('reviewOf'))
        print(f'\n复核单 {len(checkers)} 条，已关联被复核任务 {paired} 条（--for 显式 {sum(1 for r in checkers if r.get("pairSource") == "explicit")}，同名前缀推测 {sum(1 for r in checkers if r.get("pairSource") == "inferred")}）。')


def new(args, prepare=False):
    """组装标准 brief；预览不写盘，正文文件与 stdin 使用明确输入规则。"""
    if args.to == 'claude' and args.tier == 'fable':
        raise ValueError('Fable 只用 executor-fable 子代理派单（Agent 工具，subagent_type=executor-fable）')
    for option, products in [('tier', ['claude']), ('review', ['gpt', 'grok']),
                             ('low', ['gpt', 'gemini']), ('high', ['gpt', 'gemini']), ('xhigh', ['gpt', 'gemini']), ('max', ['gpt']), ('simple', ['gpt']), ('sol', ['gpt']), ('luna', ['gpt']), ('model', ['grok']), ('subagents', ['grok']),
                             ('bulk', ['gemini'])]:
        if getattr(args, option) and args.to not in products:
            raise ValueError('--' + option + ' 仅用于 --to ' + '|'.join(products) + '。')
    if args.fast and args.to != 'gpt':
        raise ValueError('--fast 仅用于 --to gpt。')
    if sum([args.low, args.high, args.xhigh, args.max]) > 1:
        raise ValueError('--low、--high、--xhigh 和 --max 不能同用。')
    if args.to == 'gpt' and (args.xhigh or args.max) and not args.luna:
        raise ValueError('--xhigh 和 --max 仅用于 --luna。')
    if args.luna and (args.simple or args.review):
        raise ValueError('--luna 不能与 --simple 或 --review 同用。')
    if args.sol and (args.simple or args.luna):
        raise ValueError('--sol 不能与 --simple 或 --luna 同用。')
    if args.make == 'video' and args.to != 'grok':
        raise ValueError('--make video 仅用于 --to grok。')
    if args.for_name and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', args.for_name):
        raise ValueError('--for 需要被复核的任务名（字母、数字、下划线与连字符）。')
    day = datetime.date.today().isoformat()
    folder = Path.home() / '.agent-reports' / day
    path = folder / (args.name + '.brief.md')
    if path.exists() and not args.dry_run:
        raise ValueError('同名 brief 已存在，拒绝覆盖；请用 amend 或换名。')
    report = str(Path(args.report).expanduser().absolute()) if args.report else str(folder / (args.name + '.md'))
    auth = args.auth.split(',')
    if any(a not in AUTH for a in auth):
        raise ValueError('未知授权块。可用：' + ','.join(AUTH))
    if 'local-commit' in auth:
        auth = [a for a in auth if a != 'local']
    pitfalls = args.pitfalls.split(',') if args.pitfalls is not None else (['node-proxy', 'zsh', 'secrets', 'shared-tree'] if args.to in ('gpt', 'grok') else ['secrets', 'fleet-bg'])
    if args.pitfalls is None and 'deploy-prod' in auth:
        pitfalls.append('pnpm-entry')
        pitfalls.extend(p.stem[8:] for p in BLOCKS.glob('pitfall-deploy-*.md'))
    if any(p not in PITFALLS and not (BLOCKS / ('pitfall-' + p + '.md')).exists() for p in pitfalls if p):
        raise ValueError('未知已知坑块。')
    values = {'NAME': args.name, 'REPORT': report, 'DATE': day,
              'COMMITS': '本地提交仅限授权分支，报告列出本地提交哈希' if 'local-commit' in auth or 'deploy-prod' in auth else '本单不做 git 提交，报告不需要提交哈希'}
    if args.body and args.body != '-':
        body_path = Path(args.body).expanduser()
        if not body_path.is_file():
            raise ValueError(f'--body 不是文件路径：{diagnostic_path(body_path)}；--body 需要文件路径，用 - 读取 stdin。')
        body = body_path.read_text()
    else:
        body = sys.stdin.read() if args.body == '-' or not sys.stdin.isatty() else ''
    if not args.goal and not body.strip():
        raise ValueError('请提供 --goal、--body 或 stdin 正文。')
    classification = PRODUCTS[args.to] + (' 只读复核' if args.review else '')
    if args.to == 'claude':
        classification += ' ' + (args.tier or 'sonnet')
    is_review = bool(args.review or args.for_name or (args.type or '').lower() == 'review')
    parts = [f'归类：{classification}；理由：{args.why or classification + "任务，按既有路由执行"}\nREPORT: {report}', block('style-sol', values), block('time-box', values),
             '## 授权覆盖\n' + '\n\n'.join(block('auth-' + a, values) for a in dict.fromkeys(auth))]
    if args.task_action:
        parts.append('动作: ' + args.task_action)
    if args.budget:
        parts.append('## 预算与重试限制\n' + args.budget)
    if args.goal:
        parts.append('## 目标\n' + args.goal)
    if body.strip():
        parts.append(body.strip())
    if args.make:
        parts.append('## 产物要求\n' + block('make-' + args.make, {'OUTDIR': '/tmp/' + args.name + '/'}))
        if args.make == 'image':
            parts.append('执行方法：' + ('使用 imagegen Skill 和 Codex 内置 image_gen 工具。' if args.to == 'gpt' else 'Grok 使用内置 image_gen / image_edit 工具，model 参数留空。' if args.to == 'grok' else '使用当前产品可用的真实图片生成工具，生成受阻时如实报告缺口。'))
    writes = [report, '/tmp/' + args.name + '/', *(args.write or [])]
    parts.append('## 允许范围\n允许写：\n' + '\n'.join('- ' + p for p in dict.fromkeys(writes)) + '\n- 正文明确写了“允许读写”的路径（含源码仓与其 .git）\n只读：\n' + ('\n'.join('- ' + p for p in (args.read or [])) or '按正文指定路径读取。'))
    if args.forbid:
        parts.append('另行授权事项：' + args.forbid)
    parts.append('## 已知坑\n' + '\n\n'.join(block('pitfall-' + p, values) for p in dict.fromkeys(pitfalls) if p))
    parts.extend(['## 验收\n' + (('产物清单：\n' + '\n'.join('- ' + item for item in args.deliverables) + '\n\n') if args.deliverables else '') + block('accept-boilerplate', values) + '\n\n' + block('report-template', values)
                  + ('\n\n' + block('review-ledger', values) if is_review else ''), rule()])
    repo_match = re.search(r'^仓库[ \t]*[:：][ \t]*([^\s，,；;（(]+)', body, re.M)
    entry_writes = re.findall(r'^可写路径[ \t]*[:：][ \t]*(/[^\s，,；;（(]+)', body, re.M)
    object_ = {'repo': repo_match.group(1).strip('`') if repo_match else '',
               'writes': list(dict.fromkeys([*(args.write or []), *entry_writes])),
               'environment': args.environment or '', 'question': args.question or args.goal or ''}
    parts.insert(2, '对象: ' + json.dumps(object_, ensure_ascii=False))
    text = '\n\n'.join(parts) + '\n'
    location = args.on or os.environ.get('FLEET_DEFAULT_ON', 'mini')
    if location == 'mini' and not mini.available() and args.on != 'mini': location = 'local'
    checked(text, args.to, args.simple, location, not args.no_lint)
    action_match = re.search(r'^动作[ \t]*[:：][ \t]*(.*)$', body, re.M)
    actions = args.task_action or (action_match.group(1) if action_match else '')
    meta = {'to': args.to, 'name': args.name, 'brief': str(path), 'report': report,
            'auth': auth, 'actions': [a.strip() for a in actions.split('/') if a.strip()],
            'tier': args.tier, 'review': args.review, 'sol': args.sol, 'low': args.low, 'high': args.high,
            'xhigh': True if (args.to == 'gemini' and not (args.low or args.high)) else args.xhigh,
            'max': args.max, 'simple': args.simple, 'luna': args.luna, 'fast': args.fast, 'no-fast': args.no_fast, 'model': args.model,
            'subagents': args.subagents, 'bulk': args.bulk, 'expect-changes': args.expect_changes,
            # 账本用：难度档、任务类型、被复核任务名；relaunch/amend 沿用 meta，不另存。
            'paths': list(dict.fromkeys([*(mini.expand_path(p) for p in (args.read or [])), *(mini.expand_path(p) for p in (args.write or [])), *mini.referenced_paths((args.goal or '') + '\n' + body)])),
            'on': args.on, 'pull': args.pull, 'object': object_ if object_['repo'] else None, 'after': args.after, 'level': args.level, 'type': (args.type or ('review' if is_review else 'media' if args.make else None)), 'for': args.for_name}
    if args.to == 'jev':
        meta['questions'] = str(path.with_suffix('.questions.json'))
    if prepare:
        return text, meta
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


def batch(args, parser):
    entries = json.loads(Path(args.manifest).read_text())
    if not isinstance(entries, list) or not entries:
        raise ValueError('batch 清单需要非空 JSON 数组，每项是 new 的参数数组。')
    jobs = []
    for argv in entries:
        if not isinstance(argv, list) or not all(isinstance(v, str) for v in argv):
            raise ValueError('batch 每项必须是参数字符串数组。')
        item = parser.parse_args(['new', *argv])
        if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', item.name):
            raise ValueError('batch 任务名无效。')
        if item.dry_run or item.no_launch or not item.body or item.body == '-':
            raise ValueError('batch 每项须提供 --body 文件，不使用 stdin、--dry-run 或 --no-launch。')
        text, meta = new(item, prepare=True)
        jobs.append((item, text, meta))
    names = [item.name for item, _, _ in jobs]
    if len(set(names)) != len(names):
        raise ValueError('batch 任务名重复。')
    by_name = {meta['name']: meta for _, _, meta in jobs}
    def follows(meta, name, seen=None):
        seen = set() if seen is None else seen
        after = meta.get('after')
        if not after or after in seen: return False
        return after == name or (after in by_name and follows(by_name[after], name, seen | {after}))
    for name, meta in by_name.items():
        if follows(meta, name): raise ValueError('batch --after 存在循环依赖。')
    overlaps = {}
    for i, (_, _, left) in enumerate(jobs):
        a = [os.path.realpath(p) for p in (left.get('object') or {}).get('writes', [])]
        for j, (_, _, right) in enumerate(jobs):
            b = [os.path.realpath(p) for p in (right.get('object') or {}).get('writes', [])]
            overlaps[i, j] = any(x == y or x.startswith(y.rstrip('/') + '/') or y.startswith(x.rstrip('/') + '/') for x in a for y in b)
    print('重叠矩阵（X=可写路径重叠，.=无重叠）', flush=True)
    print('任务 ' + ' '.join(names), flush=True)
    for i, name in enumerate(names):
        print(name + ' ' + ' '.join('-' if i == j else 'X' if overlaps[i, j] else '.' for j in range(len(jobs))), flush=True)
    for i, (_, _, left) in enumerate(jobs):
        for j in range(i):
            right = jobs[j][2]
            if overlaps[i, j] and not (follows(left, right['name']) or follows(right, left['name'])):
                raise ValueError('batch 可写路径重叠；请用 --after 明确串行。')
    if args.dry_run: return
    for item, _, _ in jobs:
        item.no_launch = True
        new(item)
    pending = list(jobs)
    active = {}
    failures = []
    while pending or active:
        for job in pending[:]:
            meta = job[2]
            after = meta.get('after')
            if after in active or any(j[2]['name'] == after for j in pending): continue
            active[meta['name']] = subprocess.Popen([sys.executable, __file__, 'relaunch', meta['name']])
            pending.remove(job)
        for name, proc in list(active.items()):
            code = proc.poll()
            if code is not None:
                if code: failures.append(name)
                del active[name]
        if pending or active: time.sleep(0.1)
    if failures: raise ValueError('batch 任务失败：' + ', '.join(failures))


def build_parser():
    """解析公开命令入口；状态默认仅保留非终态及最近一小时。"""
    parser = argparse.ArgumentParser(description='fleet-go：短参数组装标准 brief；前台执行 fleet。')
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('new')
    p.add_argument('name')
    p.add_argument('--to', choices=PRODUCTS, required=True)
    p.add_argument('--on', choices=['mini', 'local'])
    p.add_argument('--pull', action='store_true')
    p.add_argument('--tier', choices=['haiku', 'sonnet', 'opus', 'fable'])
    p.add_argument('--model')
    p.add_argument('--make', choices=['image', 'video'])
    for option in ['review', 'low', 'high', 'xhigh', 'max', 'simple', 'sol', 'luna', 'fast', 'no-fast', 'subagents', 'bulk', 'expect-changes']:
        p.add_argument('--' + option, action='store_true')
    for option in ['why', 'goal', 'body', 'budget', 'forbid', 'pitfalls', 'report', 'after', 'environment', 'question']:
        p.add_argument('--' + option)
    p.add_argument('--level', type=level_arg, help='难度档 L1–L4，记入账本')
    p.add_argument('--type', type=str.lower, help='任务类型，记入账本：work|review|research|copy|media|orchestrate|judge|ops 等')
    p.add_argument('--for', dest='for_name', help='本单复核的任务名，记入账本做 maker/checker 配对')
    p.add_argument('--deliverables', action='append', help='交付物及篇幅上限，可多次指定')
    p.add_argument('--action', dest='task_action', help='动作，多项用 / 分隔：只读、改代码、本地提交、推送、部署、付费')
    p.add_argument('--auth', default='local')
    p.add_argument('--no-lint', action='store_true', help='特殊单豁免入口与授权 lint')
    for option in ['write', 'read']:
        p.add_argument('--' + option, nargs='+', action='extend')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--dry-run', action='store_true')
    group.add_argument('--no-launch', action='store_true')
    p = sub.add_parser('batch', help='JSON 数组，每项为 new 的参数数组；先打印重叠矩阵')
    p.add_argument('manifest')
    p.add_argument('--dry-run', action='store_true')
    p = sub.add_parser('amend')
    p.add_argument('name')
    p.add_argument('message')
    p.add_argument('--on', choices=['mini', 'local'])
    p.add_argument('--simple', action='store_true', help='后续重派使用 Terra')
    p.add_argument('--luna', action='store_true', help='后续重派使用 Luna')
    p.add_argument('--low', action='store_true', help='后续重派使用 low 推理')
    p.add_argument('--high', action='store_true', help='后续重派使用 high 推理')
    p.add_argument('--xhigh', action='store_true', help='后续重派使用 xhigh 推理（GPT 需 --luna，Gemini 默认 xhigh）')
    p.add_argument('--max', action='store_true', help='后续重派使用 Luna max 推理')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--say', action='store_true')
    group.add_argument('--restart', action='store_true')
    p = sub.add_parser('relaunch')
    p.add_argument('name')
    p.add_argument('--on', choices=['mini', 'local'])
    p.add_argument('--pull', action='store_true')
    p.add_argument('--to', choices=PRODUCTS)
    p.add_argument('--tier', choices=['haiku', 'sonnet', 'opus', 'fable'])
    p.add_argument('--simple', action='store_true', help='GPT 任务改用 Terra，默认不开 fast')
    p.add_argument('--luna', action='store_true', help='GPT 任务改用 Luna，默认 xhigh 且不开 fast')
    p.add_argument('--low', action='store_true', help='GPT/Gemini 任务使用 low 推理')
    p.add_argument('--high', action='store_true', help='GPT/Gemini 任务使用 high 推理')
    p.add_argument('--xhigh', action='store_true', help='Luna/Gemini 使用 xhigh 推理（Gemini 默认 xhigh）')
    p.add_argument('--max', action='store_true', help='Luna 使用 max 推理')
    p.add_argument('--fast', action='store_true', help='GPT 任务开启 fast')
    p.add_argument('--no-fast', action='store_true', help='兼容旧用法，无副作用')
    p = sub.add_parser('read')
    p.add_argument('name')
    group = p.add_mutually_exclusive_group()
    for option in ['report', 'result', 'log']: group.add_argument('--' + option, action='store_true')
    p.add_argument('--head', type=int)
    p.add_argument('--pull', action='store_true')
    for action in ['say', 'stop']:
        p = sub.add_parser(action)
        p.add_argument('name')
        if action == 'say': p.add_argument('message')
    p = sub.add_parser('lint')
    p.add_argument('brief')
    p.add_argument('--no-lint', action='store_true', help='特殊单豁免入口与授权 lint')
    p.add_argument('--simple', action='store_true')
    p.add_argument('--on', choices=['mini', 'local'], default=os.environ.get('FLEET_DEFAULT_ON', 'mini'))
    p.add_argument('--to', choices=PRODUCTS, default='gpt')
    sub.add_parser('team')
    p = sub.add_parser('status')
    p.add_argument('--all', action='store_true')
    p = sub.add_parser('score')
    p.add_argument('--since', help='只统计该日期（YYYY-MM-DD）及以后的账本行')
    return parser


def main():
    parser = build_parser()
    if any(a == '--kind' or a.startswith('--kind=') for a in sys.argv[1:]):
        raise ValueError('请使用 --to gpt|openai|claude|grok|gemini|jev。')
    args = parser.parse_args()
    if hasattr(args, 'name') and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', args.name):
        raise ValueError('名称只能包含字母、数字、下划线与连字符。')
    if args.action == 'new':
        new(args)
    elif args.action == 'batch':
        batch(args, parser)
    elif args.action == 'amend':
        amend(args)
    elif args.action == 'relaunch':
        relaunch(args.name, args.to, args.tier, args.simple, args.fast, args.no_fast, args.luna, args.high, args.xhigh, args.max, args.low, args.on, args.pull)
    elif args.action == 'read':
        rec = mini.find(args.name)
        if not rec or rec.get('local'): raise ValueError('找不到 Mini 任务；最新同名任务可能在本机。')
        sys.exit(mini.read(rec, 'log' if args.log else 'result' if args.result else 'report', args.head, args.pull))
    elif args.action in ('say', 'stop'):
        os.execvp('fleet', ['fleet', args.action, args.name] + ([args.message] if args.action == 'say' else []))
    elif args.action == 'team':
        os.execvp('fleet', ['fleet', 'team'])
    elif args.action == 'lint':
        checked(Path(args.brief).read_text(), args.to, args.simple, args.on, not args.no_lint)
        print('lint 通过。')
    elif args.action == 'score':
        score(args)
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
            print(f"{warning}{r['runId'][-16:]} {r.get('status', '?')} {r.get('duration', '?')} {Path(r.get('briefPath') or r.get('name') or '?').name} {r.get('model', '?')} {r.get('location', 'local')}")
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
