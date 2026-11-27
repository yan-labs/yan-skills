"""组装和修订派单 brief，供 fleet-go 命令调用；执行与停止仍交给 fleet。"""
import argparse
import base64
import datetime
import errno
import fcntl
import difflib
import inspect
import json
import os
from pathlib import Path
import re
import runpy
import shlex
import subprocess
import sys
import time
import tempfile
import unicodedata
import uuid
import mini
import order
import worktree
import clean
from gcp_pool_plan import choose_workspace
from types import SimpleNamespace

watch_store = runpy.run_path(str(Path(__file__).with_name('watch-store.py')))

gate_reject = runpy.run_path(str(Path(__file__).with_name('gate-reject.py')))
preview_recorded = False


def record_rejection(attempt, stage, category, name, error, preview=False):
    global preview_recorded
    gate_reject['record'](attempt, stage, category, name, error, preview)
    if preview:
        preview_recorded = True


def gate_rows():
    path = gate_reject['path']()
    if not path.exists():
        return []
    rows = []
    for line in path.read_text().splitlines():
        try:
            rows.append(json.loads(line))
        except ValueError:
            pass
    return rows


def dispatch_gate(args, stage, operation, category=None):
    args.gate_stage = stage
    try:
        result = operation()
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        if not isinstance(error, mini.QueueRejected):
            args.reject_recorded = True
            record_rejection(args.attempt_id, stage, getattr(error, 'category', category or stage), args.name, error, getattr(args, 'dry_run', False))
        raise
    args.gate_stage = None
    return result


BLOCKS = Path(__file__).resolve().parents[1] / 'skill/templates/blocks'
LEGACY_RULE = "禁止单纯转发，允许分发子步骤：不能把整个任务原样甩给另一个 agent 后只回'已启动/等结果'就结束当轮；可以拆出边界清晰的子步骤交给更便宜的 agent 做，但你必须自己掌握全局、消化并验证子任务结果，最终给出真正的结论作为你的最终答案"
PRODUCTS = {'gpt': '(a) Codex 编码', 'claude': 'Claude 月度额度', 'openai': 'OpenAI 月度API额度',
            'grok': 'Grok Build CLI', 'gemini': 'Gemini 订阅 CLI', 'jev': 'JEV 判断'}
AUTH = ['local', 'local-commit', 'readonly-web', 'deploy-prod', 'paid', 'review']
WRITE_DECLARATION = re.compile(
    r'^[ \t]*可写路径[ \t]*[:：][ \t]*([^\n]*(?:\n[ \t]*(?:/|~/|\$HOME/)[^\n]*)*)', re.M)
PITFALLS = ['node-proxy', 'zsh', 'pnpm-entry', 'local-preview', 'playwright-clean', 'shared-tree', 'secrets', 'fleet-bg', 'ssr-check']

EARLY_RULE = "你是这单的负责人，自己掌握全局；可以把边界清晰的子步骤交给更便宜的 agent，并消化、验证它们的结果，最终给出真正的结论作为你的最终答案。"


def block(name, values=None):
    text = (BLOCKS / (name + '.md')).read_text().strip()
    for key, value in (values or {}).items():
        text = text.replace('{' + key + '}', value)
    return text


def rule():
    return block('rule-sentence')


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


def worktree_call(data, location):
    if location != 'mini':
        return worktree.execute(data)
    script = Path(worktree.__file__).read_text() + "\nimport base64,sys\np=json.loads(base64.b64decode(sys.argv[1])); print(json.dumps(execute(p)))"
    result = mini.call(script, data, timeout=30 if data['action'] == 'aggregate-roots' else 600)
    if result.returncode:
        raise ValueError('Mini worktree 操作失败：' + result.stderr)
    return json.loads(result.stdout)


def prepare_worktree(name, writes, base, location, repo=None):
    """worktree 以入口「仓库:」为准（没有才按 --write 推断），不看 cwd；子模块只初始化可写路径所在的那几个。"""
    if not writes and not repo:
        raise ValueError('--worktree 需要入口「仓库: <绝对路径>」或 --write。')
    writes = [path.strip() for part in mini.split_paths(writes) for path in mini.expand_braces(part)]
    convert = lambda p: mini.remote_path(mini.expand_path(p)) if location == 'mini' else mini.expand_path(p)
    payload = {'repo': convert(repo) if repo else None, 'writes': [convert(p) for p in writes]}
    script = """import base64,json,subprocess,sys,pathlib
p=json.loads(base64.b64decode(sys.argv[1]))
def top(x):
 d=next((q for q in (pathlib.Path(x),*pathlib.Path(x).parents) if q.is_dir()),None)
 r=subprocess.run(['git','-C',str(d),'rev-parse','--show-toplevel'],capture_output=True,text=True) if d else None
 return r.stdout.strip() if r and r.returncode==0 else None
roots=[top(p['repo'])] if p['repo'] else sorted({t for t in map(top,p['writes']) if t})
repo=roots[0] if len(roots)==1 else None
real=lambda x: str(pathlib.Path(x).resolve())
rel=[] if not repo else [real(w)[len(real(repo))+1:] for w in p['writes'] if real(w).startswith(real(repo)+'/')]
print(json.dumps({'roots':roots,'writes':rel}))
"""
    if location == 'mini':
        result = mini.call(script, payload)
        if result.returncode: raise ValueError('Mini 上无法解析 worktree 仓库。')
        found = json.loads(result.stdout)
    else:
        found = json.loads(subprocess.run([sys.executable, '-c', script, base64.b64encode(json.dumps(payload).encode()).decode()], capture_output=True, text=True, check=True).stdout)
    roots = [r for r in found['roots'] if r]
    if not roots:
        raise ValueError('--worktree 找不到 git 仓库：' + (f'入口「仓库: {repo}」不是 git 仓库。' if repo else '--write 都不在 git 仓库里；请在正文入口写「仓库: <绝对路径>」。'))
    if len(roots) != 1: raise ValueError('--worktree 的 --write 必须属于同一个仓库；或在入口写「仓库: <绝对路径>」指定。')
    root = roots[0]
    target = str(Path(root).parent / (Path(root).name + '-wt') / name)
    data = {'action': 'create', 'repo': root, 'path': target, 'branch': 'fleet/' + name + '-' + datetime.date.today().strftime('%Y%m%d'), 'base': base or None, 'writes': found['writes']}
    return worktree_call(data, location)


def recorded_worktree(meta):
    if meta.get('worktree'):
        return meta['worktree'], meta.get('worktree_location', 'local')
    obj = meta.get('object') or {}
    if not obj.get('repo') or not meta.get('name'):
        return None, None
    # 手工建立的任务目录只从本单明确登记的可写路径反推。
    writes = [Path(path) for path in mini.split_paths(obj.get('writes', []))]
    candidates = {parent for path in writes for parent in (path, *path.parents)
                  if parent.name == meta['name']
                  and (parent.parent.name.endswith('-wt') or parent.parent.name.startswith('wt-'))}
    if len(candidates) != 1:
        return None, None
    target = candidates.pop()
    meta['dispatch_session'] = watch_store['dispatch_session']()
    location = meta.get('on') or 'mini'
    convert = mini.remote_path if location == 'mini' else str
    return {'repo': convert(obj['repo']), 'path': convert(str(target)), 'base': None,
            'branch': 'fleet/' + meta['name'] + '-' + datetime.date.today().strftime('%Y%m%d'),
            'writes': [str(path.relative_to(target)) for path in writes if target in path.parents]}, location


def rewrite_worktree(text, meta, wt, location):
    repo = mini.local_path(wt['repo']) if location == 'mini' else wt['repo']
    target = mini.local_path(wt['path']) if location == 'mini' else wt['path']
    aliases = {repo}
    for value in [*meta.get('writes', []), *([meta['object']['repo']] if (meta.get('object') or {}).get('repo') else [])]:
        resolved = os.path.realpath(value)
        if resolved == repo or resolved.startswith(repo + '/'):
            aliases.add(value[:len(value) - len(resolved[len(repo):])] if resolved != repo else value)
    for alias in sorted(aliases, key=len, reverse=True):
        text = re.sub(re.escape(alias) + r'(?=/|[^\w./-]|$)', lambda m: target, text)
    marker = '## 目标' if '## 目标' in text else '## 允许范围'
    text = text.replace(marker, 'worktree：' + target + '；分支：' + wt['branch'] + '；基点：' + str(wt.get('base') or '原有 worktree') + '\n\n' + marker, 1)
    cleanup = block('worktree-close', {'repo': shlex.quote(repo), 'path': shlex.quote(target), 'branch': shlex.quote(wt['branch']), 'base': wt['base']})
    text = re.sub(r'(^## 验收[^\n]*\n)', lambda m: m.group(1) + cleanup + '\n\n', text, count=1, flags=re.M)
    def mapped(value):
        for alias in aliases:
            if value == alias or value.startswith(alias + '/'): return target + value[len(alias):]
        return value
    for key in ('paths', 'writes', 'parameterPaths'):
        meta[key] = [mapped(v) for v in meta.get(key, [])]
    if not meta.get('object'):
        meta['object'] = {'repo': target, 'writes': list(meta.get('writes', [])), 'environment': '', 'question': ''}
    if meta.get('object'):
        meta['object']['repo'] = mapped(meta['object']['repo'])
        meta['object']['writes'] = [mapped(v) for v in meta['object']['writes']]
    # Replace serialized object as well as the human-readable paths.
    text = re.sub(r'^对象: .*$', lambda m: '对象: ' + json.dumps(meta['object'], ensure_ascii=False), text, count=1, flags=re.M)
    meta['worktree'] = wt
    meta['worktree_location'] = location
    return text


def entry_write_paths(entry):
    values = WRITE_DECLARATION.findall(entry)
    return [mini.expand_path(path) for value in mini.split_paths(values)
            if (path := re.split(r'[（(]', value, maxsplit=1)[0].strip()).startswith(('/', '~/', '$HOME/'))]


def secret_findings(text):
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
            yield f'第 {number} 行：发现疑似密钥字面量；规则 {name}（已隐藏）。'


VALID_ACTIONS = {'只读', '改代码', '本地提交', '推送', '部署', '付费'}


def parse_actions(value):
    value = re.sub(r'[（(].*?[）)]', '', value)
    parts = [part for part in re.split(r'[/、,，;；\s和]+', value.strip()) if part]
    return [action for part in parts for action in (
        [name for name, pattern in (('推送', r'推送|push'), ('部署', r'部署|deploy'),
                                    ('付费', r'付费|paid')) if re.search(pattern, part, re.I)] or [part]
    )]


def normalize_actions(text):
    def normalize(match):
        actions = parse_actions(match.group(1))
        if actions and set(actions) <= VALID_ACTIONS:
            parts = [p for p in re.split(r'[/、,，;；\s和]+(?![^（(]*[）)])', match.group(1).strip()) if p]
            line = '动作: ' + ' / '.join(parts)
            if line != match.group(0):
                print('提示：已规范动作行：' + line, file=sys.stderr)
            return line
        return match.group(0)
    return re.sub(r'^动作[ \t]*[:：][ \t]*(.*?)[ \t]*$', normalize, text, flags=re.M)


def normalize_brief(text, to, report):
    first = text.splitlines()[0] if text else ''
    if not first.startswith('归类：'):
        text = f'归类：{PRODUCTS[to]}；理由：按执行者路由\n' + text
        print('提示：已补归类首行。', file=sys.stderr)
    elif '理由：' not in first:
        text = text.replace(first, first + '；理由：按执行者路由', 1)
        print('提示：已补归类理由。', file=sys.stderr)
    before = text
    text = re.sub(r'^REPORT[ \t]*[:：][ \t]*(/[^\n]+)$', r'REPORT: \1', text, flags=re.M)
    if text != before:
        print('提示：已规范 REPORT 行。', file=sys.stderr)
    if not re.search(r'^REPORT[ \t]*[:：]', text, re.M) and report:
        lines = text.splitlines(keepends=True)
        lines.insert(1, f'REPORT: {report}\n')
        text = ''.join(lines)
        print('提示：已补 REPORT 行。', file=sys.stderr)
    return normalize_actions(text)


def repository_free(text, actions):
    if actions != {'只读'}:
        return False
    goal = re.search(r'^## 目标\s*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
    entry = re.search(r'^##?\s*入口\s*[:：]?\s*\n(.*?)(?=^##?\s|\Z)', text, re.M | re.S)
    scope = (goal.group(1) if goal else '') + '\n' + (entry.group(1) if entry else '')
    return not re.search(r'代码|源码|仓库|worktree|git\b', scope, re.I)


def strict_dispatch():
    return os.environ.get('FLEET_STRICT') == '1'


def declared_action(text):
    match = re.search(r'^动作[ \t]*[:：][ \t]*(.*)$', text, re.M)
    return match.group(1) if match else ''


def infer_local_auth(text, auth):
    return auth


def check_sensitive_actions(text, auth=None, action_text=None, review=False):
    actions = text if action_text is None else action_text
    patterns = (
        (r'部署|上线|发布|推送|(?:生产|线上).{0,16}(?:写入|修改|更新|变更|迁移)|\bdeploy\b', '--auth local-commit,deploy-prod'),
        (r'付费|充值|购买订阅|变更套餐|\bpaid\b', '--auth paid；充值、订阅和套餐变更须单独授权'),
        (r'删除|清空|擦除|清理|\b(?:DROP|TRUNCATE)\s+TABLE\b|\bDELETE\s+FROM\b', '在 brief 明确删除范围和授权'),
    )
    for number, line in enumerate(actions.splitlines(), 1):
        for pattern, suggestion in patterns:
            for match in re.finditer(pattern, line, re.I):
                print(f'警告：第 {number} 行命中「{match.group()}」；请核对 {suggestion}；可用 fleet say 追发补充。', file=sys.stderr)

    declared = set(parse_actions(declared_action(text)))
    if review or declared == {'只读'}:
        return

    if auth is None:
        grants = '\n'.join(re.findall(r'^## 授权(?:覆盖)?[ \t]*\n(.*?)(?=^## |^动作[ \t]*[:：]|\Z)', text, re.M | re.S))
        auth = [key for key in AUTH if block('auth-' + key) in grants]
        for value in re.findall(r'^授权块[：:][ \t]*([a-z,-]+)[ \t]*$', grants, re.M):
            auth.extend(value.split(','))
    required = {'推送': 'local-commit', '部署': 'deploy-prod', '付费': 'paid'}
    missing = {key for action, key in required.items() if action in declared and key not in auth}
    if missing:
        target_auth = ','.join(key for key in AUTH if key in missing or key in auth)
        hint = fix_hint(lambda argv: replace_option(argv, '--auth', target_auth))
        raise ValueError('动作行缺少授权，请补 --auth ' + target_auth + hint)


def lint(text, to='gpt', simple=False, on='local', extra=True, sol=False, no_lint=False, project=None):
    errors = []
    first = text.splitlines()[0] if text else ''
    if not no_lint and (not first.startswith('归类：') or '理由：' not in first):
        errors.append('第一行必须以「归类：」开头并含「理由：」。')
    if not no_lint and not re.search(r'^REPORT: /[^\n]+$', text, re.M):
        errors.append('缺少 REPORT: <绝对路径> 行。')
    if not no_lint and rule() not in text and LEGACY_RULE not in text and EARLY_RULE not in text:
        errors.append('缺少逐字规则句。')
    errors.extend(secret_findings(text))
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
        entry_writes = entry_write_paths(entry)
        allowed = re.search(r'^## 允许范围\s*\n允许写：\n(.*?)(?=^只读：|^## |\Z)', text, re.M | re.S)
        writes = [*entry_writes, *mini.split_paths(re.findall(r'^- (/[^\n]+)$', allowed.group(1), re.M) if allowed else [])]
        if writes:
            paths = list(dict.fromkeys(mini.expand_path(path) for path in writes))
            try:
                if on == 'mini':
                    paths = [mini.remote_path(path) for path in paths]
                roots = worktree_call({'action': 'aggregate-roots', 'paths': paths}, on)['roots']
            except (OSError, ValueError, subprocess.SubprocessError, KeyError):
                print('警告：未能核验可写路径是否为多仓聚合根。', file=sys.stderr)
            else:
                for root in roots:
                    errors.append(f'可写路径覆盖多仓聚合根：{root}。请改为具体仓库 worktree 或子目录。')
        if not action_match:
            print('警告：缺少动作行；请补充动作。', file=sys.stderr)
        else:
            tokens = parse_actions(action_match.group(1))
            actions = set(tokens)
            auth_match = re.search(r'^## 授权覆盖\s*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
            auth_text = auth_match.group(1) if auth_match else ''
            local = '本地文件修改、构建与预览' in auth_text or bool(re.search(r'^授权块：.*(?<![\w-])local(?![\w-])', auth_text, re.M))
            commit = '允许在本地分支提交' in auth_text or '允许本地提交' in auth_text or bool(re.search(r'^授权块：.*\blocal-commit\b', auth_text, re.M))
            deploy = '发布全流程' in auth_text or bool(re.search(r'^授权块：.*\bdeploy-prod\b', auth_text, re.M))
            paid = '当前目标必要的付费验证' in auth_text or bool(re.search(r'^授权块：.*\bpaid\b', auth_text, re.M))
            needed = set()
            if '改代码' in actions and not (local or commit): needed.add('local')
            if '本地提交' in actions and not commit: needed.add('local-commit')
            if needed:
                why = [msg for want, msg in [('改代码' in actions and not (local or commit), '改代码需要 local 或 local-commit 授权'),
                                               ('本地提交' in actions and not commit, '本地提交需要 local-commit 授权'),
                                               (False, '')] if want]
                current = {a for a, present in [('local', local), ('local-commit', commit), ('deploy-prod', deploy), ('paid', paid)] if present}
                current.update(a for a in ('review', 'readonly-web') if block('auth-' + a, {'REPORT': re.search(r'^REPORT: (.+)$', text, re.M).group(1) if re.search(r'^REPORT: (.+)$', text, re.M) else ''}) in auth_text or re.search(r'^授权块：.*(?<![\w-])' + re.escape(a) + r'(?![\w-])', auth_text, re.M))
                current.update(needed)
                if 'local-commit' in current: current.discard('local')
                errors.insert(0, '缺授权块 ' + ','.join(a for a in AUTH if a in needed) + '：' + '；'.join(why) + '。改用 --auth ' + ','.join(a for a in AUTH if a in current) + '（已派的单用 fleet-go amend <名字> "<说明>" --auth 同值）')
            if not actions or not actions <= VALID_ACTIONS:
                unknown = ['（已隐藏）' if list(secret_findings(text)) else a for a in tokens if a not in VALID_ACTIONS]
                errors.append('动作行含未知或空动作：' + '、'.join(unknown) + '。合法集合：只读、改代码、本地提交、推送、部署、付费。如未知词是多余内容，可改为：动作: ' + (' / '.join(a for a in tokens if a in VALID_ACTIONS) or '只读'))
            repo = re.search(r'^[ \t]*仓库[ \t]*[:：][ \t]*([^\s，,；;（(]+)', entry, re.M)
            if not repo and not repository_free(text, actions):
                errors.append('入口缺少仓库绝对路径。')
            elif repo:
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
            if actions - {'只读'} and not entry_writes:
                errors.append('入口缺少可写路径。')
            root = resolve_project(project, entry_repo(text))
            errors.extend(brief_gate_errors(root, actions, text))
        if to == 'gpt' and not sol and re.search(r'未知|自己找', entry):
            hit = re.search(r'未知|自己找', entry)
            number = text.count('\n', 0, entry_match.start(1) + hit.start()) + 1
            print(f'提示：入口不清时先查 brief 引用的报告与仓库。第 {number} 行命中原文：{hit.group()}。', file=sys.stderr)
        if simple:
            if len(repository_roots(writes, on)) >= 2:
                errors.append('Terra 可写路径跨两个或以上仓库，请改用 Sol（加 --sol）。')
            goal = re.search(r'^## 目标\s*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
            if goal and re.search(r'打通|接入|跨服务', goal.group(1)):
                files = re.findall(r'(?:^|[\s:：、,，`])((?:/|\.?\.?/)?[\w@./-]+\.[A-Za-z][A-Za-z0-9]*)(?=$|[\s、,，`）)])', entry, re.M)
                repo_match = re.search(r'仓库[ \t]*[:：][ \t]*(/[^\s，,；;（(]+)', entry)
                repo_path = repo_match.group(1) if repo_match else '/'
                concrete = [os.path.normpath(f if f.startswith('/') else os.path.join(repo_path, f)) for f in files]
                object_match = re.search(r'^对象: (.+)$', text, re.M)
                report = re.search(r'^REPORT: (.+)$', text, re.M)
                target = Path(report.group(1)) if report else None
                outputs = {str(target), str(target.with_suffix('.checkpoint.md')), '/tmp/' + target.stem + '/'} if target else set()
                scoped = [p for p in (json.loads(object_match.group(1)).get('writes', []) if object_match else writes)
                          if not any(Path(p).resolve() == Path(output).resolve() for output in outputs)]
                if not concrete or any(not any(f == w.rstrip('/') or f.startswith(w.rstrip('/') + '/') for f in concrete) for w in scoped):
                    errors.append('Terra 的跨服务目标入口未列全具体文件，请改用 Sol（加 --sol）或补齐入口文件。')
        if errors:
            errors.append('示例（按实际任务和授权修改）：\n动作: 改代码 / 本地提交\n## 入口\n仓库: /tmp\n可写路径: /tmp/example\n## 授权覆盖\n授权块：local-commit')
    return errors


def replace_option(argv, flag, value=None, *, insert=True):
    """返回 argv 副本，将 --flag 替换为 value（value 为 None 时移除）。"""
    out = []
    i = 0
    replaced = False
    prefix = flag + '='
    while i < len(argv):
        tok = argv[i]
        if tok == flag:
            if not replaced and value is not None:
                out.extend([flag, value])
            replaced = True
            i += 2
            continue
        if tok.startswith(prefix):
            if not replaced and value is not None:
                out.extend([flag, value])
            replaced = True
            i += 1
            continue
        out.append(tok)
        i += 1
    if not replaced and insert and value is not None:
        out.extend([flag, value])
    return out


def replace_positional(argv, old_value, new_value):
    """替换子命令后第一个匹配 old_value 的位置参数。"""
    out = list(argv)
    if len(out) < 2:
        return out
    value_flags = {
        '--to', '--on', '--local-reason', '--tier', '--model', '--make',
        '--why', '--goal', '--body', '--budget', '--forbid', '--pitfalls',
        '--report', '--after', '--environment', '--question', '--override-order',
        '--level', '--type', '--for', '--deliverables', '--action', '--auth',
        '--scene', '--project',
    }
    i = 1
    while i < len(out):
        tok = out[i]
        if tok in value_flags:
            i += 2
            continue
        if tok in ('--write', '--read'):
            i += 1
            while i < len(out) and not out[i].startswith('-'):
                i += 1
            continue
        if tok == '--worktree':
            i += 2 if i + 1 < len(out) and not out[i + 1].startswith('-') else 1
            continue
        if tok.startswith('-'):
            i += 1
            continue
        if tok == old_value:
            out[i] = new_value
            return out
        i += 1
    return out


def sanitize_command(argv, suffix=''):
    cmd = shlex.join(['fleet-go', *argv]) + suffix
    redactor = Path(__file__).resolve().parents[1] / 'bin/redact'
    try:
        sanitized = subprocess.run([str(redactor)], input=cmd, capture_output=True, text=True, check=True).stdout.rstrip('\n')
    except (OSError, subprocess.SubprocessError):
        return None
    return cmd if sanitized == cmd and not list(secret_findings(cmd)) else None


def fix_hint(transform, *, fallback_argv=None, suffix='', label='可复制修正命令：'):
    base = list(sys.argv[1:]) if len(sys.argv) >= 2 and sys.argv[1] in ('new', 'lint', 'amend', 'relaunch') else list(fallback_argv or [])
    if not base:
        return ''
    updated = transform(base)
    cmd = sanitize_command(updated, suffix=suffix)
    return f'\n{label}{cmd}' if cmd else ''


def next_available_name(original, folder):
    suffix = 2
    while report_matches(f'{original}-{suffix}.brief.md') or (folder / f'{original}-{suffix}.md').exists():
        suffix += 1
    return f'{original}-{suffix}'


def next_available_report(report_arg):
    raw = Path(report_arg)
    stem, suffix = raw.stem, raw.suffix
    number = 2
    while True:
        candidate = raw.with_name(f'{stem}-{number}{suffix}')
        if not candidate.expanduser().exists():
            return str(candidate)
        number += 1


def resolve_on_mini_location(args, *, notify=True):
    """已在 Mini 本机运行且未显式指定 --on mini 时，自动填好本机执行位置（不放宽授权）。"""
    if not mini.on_mini():
        return False
    if getattr(args, 'on', None) is None:
        args.on = 'local'
        if hasattr(args, 'local_reason') and not (args.local_reason or '').strip():
            args.local_reason = '已在 Mini 本机运行'
        if notify:
            print('提示：检测到已在 Mini 本机运行，自动使用 --on local（不放宽授权）。', file=sys.stderr)
        return True
    if getattr(args, 'on', None) == 'local' and hasattr(args, 'local_reason') and not (args.local_reason or '').strip():
        args.local_reason = '已在 Mini 本机运行'
        if notify:
            print('提示：检测到已在 Mini 本机运行，已自动补充 --local-reason（不放宽授权）。', file=sys.stderr)
        return True
    return False


def retry_command():
    if len(sys.argv) < 2 or sys.argv[1] not in ('new', 'lint', 'amend', 'relaunch'):
        return None
    return sanitize_command(sys.argv[1:])


def checked(text, to, simple=False, on='local', extra=False, sol=False, no_lint=False, project=None, auth=None, sensitive_text=None, review=False):
    secrets = list(secret_findings(text))
    if secrets:
        raise ValueError('\n'.join(secrets))
    if not strict_dispatch():
        check_sensitive_actions(text, auth, sensitive_text, review)
    errors = lint(text, to, simple, on, extra, sol, no_lint, project)
    if errors and not strict_dispatch():
        warnings = [e for e in errors if not e.startswith(('示例', '缺授权块'))]
        if warnings:
            print('提示：' + '；'.join(warnings).replace('\n', ' '), file=sys.stderr)
        return
    if errors:
        retry = retry_command()
        lines = []
        for error in errors:
            lines.append(error)
            if '逐字规则' in error:
                lines.append('补充：' + rule())
            elif retry:
                lines.append('修改后重跑：' + retry)
        raise ValueError('\n'.join(lines))
    if strict_dispatch():
        check_sensitive_actions(text, auth, sensitive_text, review)


OBSTACLE_NOTE = '遇到缺文件、工具不可用等阻碍必须在报告「未完成」里写明，不得略过。'


def gpt_tier(meta):
    return meta.get('tier') if meta.get('tier') in ('terra', 'sol', 'luna', 'astra') else ('luna' if meta.get('luna') else 'terra' if meta.get('simple') else 'sol')


def command(meta):
    to = meta['to']
    entry = {'gpt': 'code', 'openai': 'openai', 'claude': meta.get('tier') or 'sonnet', 'grok': 'grok-cli',
             'gemini': 'bulk' if meta.get('bulk') else 'copy', 'jev': 'judge'}[to]
    args = ['fleet', entry, meta['brief']]
    if to == 'jev':
        args.append(meta['questions'])
    if to == 'gemini' and meta.get('type'):
        args.extend(['--type', meta['type']])
    if to == 'gemini' and meta.get('gemini_agent') and meta.get('worktree'):
        args.extend(['--agent-mode', '--cwd', meta['worktree']['path']])
    args.extend(['--name', meta['name'], '--report', meta['report']])
    if meta.get('workspace') == 'gcp':
        repo_path = (meta.get('object') or {}).get('repo')
        if not repo_path: raise ValueError('GCP 工作区需要指定入口仓库。')
        args.extend(['--cwd', repo_path])
        args.extend(['--workspace', meta['workspace']])
        if meta.get('gcpx_branch'): args.extend(['--gcpx-branch', meta['gcpx_branch']])
    if to == 'gpt':
        args.append({'terra': '--simple', 'sol': '--sol', 'luna': '--luna', 'astra': '--astra'}[gpt_tier(meta)])
    for option in ['review', 'low', 'high', 'xhigh', 'max', 'fast', 'no-fast', 'subagents', 'expect-changes']:
        if meta.get(option):
            args.append('--' + option)
    if os.environ.get('FLEET_WAIT_QUIET') == '1': args.append('--quiet')
    if meta.get('model'):
        args.extend(['--model', meta['model']])
    return args


def watch_seat(meta):
    return watch_store['current_seat'](os.getcwd(), repo=(meta.get('object') or {}).get('repo'))


def launch(meta):
    """由 new/relaunch 前台替换为 fleet，保留完成通知和退出码。"""
    if meta.get('workspace') == 'gcp' and (os.environ.get('FLEET_GCP_WORKSPACE_EXPERIMENTAL') != '1' or meta.get('to') != 'gpt'):
        raise ValueError('GCP 工作区连接及控制面尚未完成；禁止降级到本机工作区。')
    location = meta.get('on') or 'mini'
    if location == 'local':
        if not meta.get('local_reason', '').strip():
            hint = fix_hint(lambda argv: replace_option(argv, '--local-reason', '本机执行理由'))
            raise ValueError('--on local 必须同时提供 --local-reason 理由。' + hint)
        meta['execution'] = 'local'
        meta['watch_seat'] = watch_seat(meta)
        Path(meta['brief']).with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
        started = int(time.time() * 1000)
        try:
            result = subprocess.run(command(meta), cwd=tempfile.mkdtemp(prefix='fleet-readonly-') if meta.get('temporary_cwd') else None, env={**os.environ, 'FLEET_SEAT': meta['watch_seat'] or ''})
            runs = Path(os.environ.get('AGENT_FLEET_RUNS_DIR') or Path.home() / '.agent-fleet/runs')
            admitted = False
            if result.returncode:
                for row_path in runs.glob('*.queue.json'):
                    try:
                        row = json.loads(row_path.read_text())
                        if row.get('briefPath') == meta['brief'] and row.get('createdAt', 0) >= started:
                            admitted = True
                            break
                    except (OSError, ValueError, TypeError):
                        admitted = True
                        break
                if not admitted:
                    meta['execution'] = 'failed'
                    meta['launch_exit'] = result.returncode
                    Path(meta['brief']).with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
            sys.exit(result.returncode)
        except OSError as error:
            meta['execution'] = 'failed'
            meta['launch_error'] = str(error)
            Path(meta['brief']).with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
            raise
    reason = 'Mini 不可达' if not mini.available() else mini.preflight(meta, meta.get('paths', []))
    meta['execution'] = 'failed' if reason else 'mini'
    if not reason:
        meta['watch_seat'] = watch_seat(meta)
    Path(meta['brief']).with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
    if reason:
        hint = (fix_hint(
            lambda argv: replace_option(replace_option(argv, '--on', 'local'), '--local-reason', 'Mini不可达改本机'),
            label='如确认改在本机执行，可复制修正命令：',
        ) if reason == 'Mini 不可达' else '')
        raise ValueError(reason + '；请在 Mini 补齐（建 worktree、同步目录）后重派。' + hint)
    try:
        sys.exit(mini.launch(meta, command(meta)))
    except mini.QueueRejected:
        meta['execution'] = 'failed'
        Path(meta['brief']).with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
        raise


def running(active_only=True, status_timeout=None, recent_seconds=None, name=None, brief=None):
    """读取 fleet 控制面，重启核验需包含 stopped，不能把消失当停止成功。

    Mini 状态一次 ssh 批量取；status_timeout 给定时失败只提示一行，不补 unreachable 行。
    recent_seconds 给定时 Mini 端不返回更早结束的终态行。
    name / brief 给定时只查同名（或同 brief）的任务，判重不必取全量状态；
    本机扫描超时由 FLEET_STATUS_TIMEOUT_SECONDS（默认 60）控制，这里多留 10 秒收尾。
    """
    fresh = status_timeout is None
    scoped = name is not None or brief is not None
    limit = float(os.environ.get('FLEET_STATUS_TIMEOUT_SECONDS', '60'))
    try:
        result = subprocess.run(['fleet', 'status', *(['--running'] if active_only else []), '--json',
                                 *(['--fresh'] if fresh else []), *(['--name', name] if name else []),
                                 *(['--brief-path', brief] if brief else [])],
                                capture_output=True, text=True, timeout=limit + 10)
    except subprocess.TimeoutExpired:
        raise ValueError(f'子命令 fleet status 超过 {limit + 10:g} 秒未返回；可用 FLEET_STATUS_TIMEOUT_SECONDS 调大扫描上限。') from None
    if result.returncode:
        detail = (result.stderr.strip().splitlines() or [''])[-1]
        raise ValueError(f'子命令 fleet status 失败：exit={result.returncode}。' + (f'原因：{detail}' if detail else ''))
    rows = json.loads(result.stdout)
    if not isinstance(rows, list):
        raise ValueError('fleet status 返回格式不是数组。')
    recs = [rec for rec in mini.records() if not scoped or rec.get('name') == name or (brief is not None and rec.get('brief') == brief)]
    if not recs:
        return rows
    unreachable = lambda rec: {'runId': rec['id'], 'name': rec['name'], 'briefPath': rec['brief'], 'status': 'unreachable', 'state': 'running', 'location': 'mini'}
    try:
        summaries, missing = mini.query_all(recs, fresh=fresh, since=time.time() - recent_seconds if recent_seconds is not None else None,
                                            timeout=status_timeout if status_timeout is not None else 30)
    except mini.StatusError as error:
        if status_timeout is not None:
            print(f'Mini 状态未取到：{error.reason}', file=sys.stderr)
        else:
            rows.extend(unreachable(rec) for rec in recs)
        return rows
    for rec in recs:
        row = summaries.get(rec['id'])
        if rec['id'] in missing:
            rows.append(unreachable(rec))
        elif row is not None:
            row['briefPath'] = rec['brief']
            row['name'] = rec['name']
            row['state'] = row.get('status')
            row['location'] = 'mini'
            if not active_only or row.get('status') in ('running', 'queued', 'parked', 'waiting', 'abnormal'): rows.append(row)
    return rows


def report_matches(filename):
    matches = {}
    for root in clean.report_roots():
        for path in root.glob('*/' + filename):
            if path.is_file():
                matches.setdefault(path.resolve(), path)
    return sorted(matches.values(), key=lambda p: (p.parent.name, str(p)), reverse=True)


def locate(name):
    if name.endswith('.brief.md'):
        path = Path(name).expanduser()
        if not path.is_file(): raise ValueError(f'找不到 brief：{name}')
    else:
        matches = report_matches(name + '.brief.md')
        if not matches:
            raise ValueError(f'找不到 brief：{name}。新派单用 fleet-go new {name} --to <产品> ...')
        if len(matches) > 1:
            raise ValueError(f'{name} 有 {len(matches)} 个跨日期同名 brief：' + '、'.join(map(str, matches)) + f'。\n用最新那份重派（amend 同理，名字换成路径）：fleet-go relaunch {shlex.quote(str(matches[0]))}')
        path = matches[0]
    meta = json.loads(path.with_suffix('.json').read_text())
    if meta.get('to') not in PRODUCTS:
        raise ValueError('brief 元信息缺少有效 --to；请用 fleet-go new --to <产品> 创建新任务。')
    return path, meta


def entry_paths(text):
    match = re.search(r'^## 入口\s*$([\s\S]*?)(?=^## |\Z)', text, re.M)
    if not match:
        return []
    entry = match.group(1)
    return [*([repo] if (repo := entry_repo(text)) else []), *entry_write_paths(entry)]


def fill_entry_writes(body, action, writes, project, report):
    if set(parse_actions(action)) == {'只读'}:
        return body
    repo = entry_repo(body)
    paths = ', '.join(writes or [repo or str(project or Path(report).parent)])
    header = re.search(r'^## 入口[ \t]*$', body, re.M)
    if not header:
        base = repo or project
        return body.rstrip() + '\n\n## 入口\n' + (f'仓库: {base}\n' if base else '') + f'可写路径: {paths}\n'
    end = re.search(r'^## ', body[header.end():], re.M)
    stop = header.end() + end.start() if end else len(body)
    entry = body[header.start():stop]
    if entry_write_paths(entry):
        return body
    return body[:stop].rstrip() + f'\n可写路径: {paths}\n' + body[stop:]


def refresh_body(path, meta, text):
    """--body 文件改过就把新正文换进 brief，修订块和其余样板原样保留。"""
    legacy = 'body_text' not in meta
    body_path = Path(meta['body']) if meta.get('body') else (path.with_name(path.name[:-len('.brief.md')] + '.body.md') if legacy else None)
    if not body_path or not body_path.is_file():
        return text
    body = body_path.read_text().strip()
    if meta.get('report'):
        body = narrow_report_entry(body, meta['report'])
        if not strict_dispatch() and not meta.get('review') and not legacy:
            body = fill_entry_writes(body, declared_action(body) or declared_action(text),
                                     meta.get('writes'), meta.get('project'), meta['report']).strip()
    old = meta.get('body_text')
    if legacy and body_path.stat().st_mtime <= path.stat().st_mtime:
        return text
    if body == old:
        return text
    if not old or text.count(old) != 1:
        raise ValueError(f'{body_path} 比 brief 新，但无法自动换进 {path}（旧任务没记录正文快照，或 brief 已被 worktree 改写）。\n'
                         f'要用新正文：fleet-go new <新名字> ... --body {shlex.quote(str(body_path))}\n'
                         f'确认沿用当前 brief：fleet-go relaunch {shlex.quote(str(path))} --keep-brief')
    text = text.replace(old, body, 1)
    repo = re.search(r'^仓库[ \t]*[:：][ \t]*([^\s，,；;（(]+)', body, re.M)
    if meta.get('object') or repo:
        entry_writes = entry_write_paths(body)
        previous = meta.get('object') or {}
        meta['object'] = {**previous, 'repo': repo.group(1).strip('`') if repo else '', 'writes': report_writes([*meta.get('writes', []), *entry_writes], meta.get('report') or str(path.with_name(path.name.replace('.brief.md', '.md')))),
                          'environment': previous.get('environment', ''), 'question': previous.get('question', '')}
        text = re.sub(r'^对象: .*$', lambda m: '对象: ' + json.dumps(meta['object'], ensure_ascii=False), text, count=1, flags=re.M)
    meta['paths'] = list(dict.fromkeys([*meta.get('parameterPaths', []), *entry_paths(body)]))
    meta['body'], meta['body_text'] = str(body_path), body
    path.write_text(text)
    print(f'已按 {body_path} 更新 brief 正文（修订块保留）：{path}', flush=True)
    return text


def ensure_principles(text):
    """relaunch/amend 重派时，缺思维准则的旧 brief 补上：紧随前两行（归类、REPORT）之后；已有则原样返回。"""
    if '## 思维准则（每单首要' in text:
        return text
    lines = text.splitlines(keepends=True)
    return ''.join(lines[:2]) + '\n' + block('thinking-principles') + '\n' + ''.join(lines[2:])


def project_root(path):
    path = Path(path).expanduser().resolve()
    return next((root for root in (path, *path.parents)
                 if any((root / marker).is_dir() for marker in ('.agent-fleet', '.rankup'))), None)


def resolve_project(explicit=None, repo=None):
    if explicit:
        return project_root(explicit)
    return (project_root(repo) if repo else None) or project_root(Path.cwd())


def brief_gate_errors(root, actions, text):
    if not root:
        return
    config = root / '.agent-fleet/project.json'
    guide = root / 'AGENTS.md'
    if config.is_file():
        gates = json.loads(config.read_text()).get('briefGates', [])
    elif ('改代码' in actions and guide.is_file()
          and re.search(r'^# [^\n]+ / Buildin 项目规则$', guide.read_text(), re.M)):
        gates = [{'when': {'action': '改代码'}, 'section': '验收环境',
                  'fields': ['账号', '免费空间', '付费空间', '开关', '夹具', '性能闸门'],
                  'hint': '逐项写明已就绪的入口或值；性能闸门引用计划原文，不适用的写原因。'}]
    else:
        return
    for gate in gates:
        if gate['when']['action'] not in actions:
            continue
        section = gate['section']
        match = re.search(r'^## ' + re.escape(section) + r'[ 	]*\n(.*?)(?=^## |\Z)', text, re.M | re.S)
        missing = [field for field in gate.get('fields', [])
                   if not re.search(r'^[ 	]*(?:- )?' + re.escape(field) + r'[ 	]*[:：][ 	]*\S+',
                                    match.group(1) if match else '', re.M)]
        if not match or missing:
            yield f'须填好「## {section}」' + ('；缺：' + '、'.join(missing) if missing else '') + '。' + gate.get('hint', '')


def scene_paths(root, warn=False):
    global_scenes = Path.home() / '.agent-fleet/scenes'
    paths = {path.stem: path for path in (BLOCKS.parent / 'scenes').glob('*.md')}
    paths.update({path.stem: path for path in global_scenes.glob('*.md')})
    if root:
        paths.update({path.stem: path for path in (root / '.rankup/dispatch-scenes').glob('*.md')})
        paths.update({path.stem: path for path in (root / '.agent-fleet/scenes').glob('*.md')})
    if warn and any(path.parent.name == 'dispatch-scenes' for path in paths.values()):
        print('警告：请将旧场景从 .rankup/dispatch-scenes/ 迁到 .agent-fleet/scenes/。', file=sys.stderr)
    return dict(sorted(paths.items()))


def dispatch_scenes(root):
    scenes = {}
    for name, path in scene_paths(root, warn=True).items():
        sections = re.split(r'^---[ 	]*$\n', path.read_text(), maxsplit=2, flags=re.M)
        if len(sections) != 3 or sections[0]:
            raise ValueError(f'{path} 缺少 JSON 场景文件头。')
        scenes[name] = (json.loads(sections[1]), sections[2].strip())
    return scenes


def context(root):
    path = order.order_path()
    if path.is_file():
        order.pull_for_show(path)
        try:
            print(order.show_text(path, compact=True))
        except (OSError, ValueError):
            print('警告：调遣令无法读取，请运行 fleet-go doctor。', file=sys.stderr)
    for layer, directory in [('全局层', Path.home() / '.agent-fleet'),
                             ('项目层', root / '.agent-fleet' if root else None)]:
        if directory and (directory / 'README.md').is_file():
            print(f'## {layer}')
            print('\n'.join((directory / 'README.md').read_text().splitlines()[:60]))
    scenes = dispatch_scenes(root)
    if scenes:
        print('## 派单场景')
        for name, (data, _) in scenes.items():
            print(f"- {name} · {data['description']}")
    print('优先级：用户当场指令 > 调遣令 > 项目层 > 全局层 > 源码默认。授权红线不被任何层放宽。')


def memory_findings(paths):
    entries = []
    for path in paths:
        if not path.is_file():
            continue
        lines = path.read_text().splitlines()
        limit = 60 if path.name == 'README.md' else 150
        if len(lines) > limit:
            yield '警告', path, f'超过 {limit} 行；合并或精简规则'
        dated = 0
        for n, line in enumerate(lines, 1):
            if re.search(r'用户\s*(?:\d{4}[-/])?\d{1,2}[-/]\d{1,2}|[“「『"‘][^”」』"’\n]{40,}[”」』"’]', line):
                yield '警告', path, f'第 {n} 行疑似原话；提炼规则，原话移到记录'
            dated += bool(re.search(r'(?<!\d)(?:\d{4}[-/])?\d{1,2}[-/]\d{1,2}(?!\d)|\d{1,2}月\d{1,2}日', line))
            if re.search(r'禁止|一律|从不', line) and '适用' not in line:
                yield '警告', path, f'第 {n} 行使用绝对词；补充「适用」条件'
            item = re.match(r'^\s*(?:[-*+] |\d+[.)、] )(.+)', line)
            if item:
                normalized = re.sub(r'[\W_]+', '', item[1].split('适用', 1)[0].casefold())
                if len(normalized) >= 8:
                    earlier = next(((p, i) for p, i, other in entries
                                    if difflib.SequenceMatcher(None, normalized, other).ratio() >= .85), None)
                    if earlier:
                        yield '警告', path, f'第 {n} 行近似重复于 {earlier[0]}:{earlier[1]}；合并条目'
                    entries.append((path, n, normalized))
        if dated >= 3 and dated * 5 >= len(lines):
            yield '警告', path, '日期密度过高；将事件移到记录'
        for finding in secret_findings('\n'.join(lines)):
            yield '错误', path, finding + '从规则移出并轮换凭据'


def machine_checks(source, config):
    def git(repo, *args):
        try:
            result = subprocess.run(['git', '-C', str(repo), *args], capture_output=True, text=True, timeout=5,
                                    env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'})
            return result.stdout.strip() if result.returncode == 0 else ''
        except (OSError, subprocess.SubprocessError):
            return ''

    def main_clone(repo):
        common = git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir')
        return Path(common).parent if common else repo

    runtime = Path.home() / '.agent-fleet/runtime'
    release = Path(source)
    if release.parent == runtime:
        print('运行版本：' + (release / '.fleet-release').read_text().strip())
        source = Path.home() / 'PROJECT/kcsx/macmini/yan-skills'
    source = main_clone(Path(source))
    for name, repo, remote_ref in [('源码仓', source, 'refs/heads/main'), ('全局配置仓', Path(config), 'HEAD')]:
        head = git(repo, 'rev-parse', 'HEAD') if repo.is_dir() else ''
        if not head:
            print(f'{name}：未取到；请检查安装和 Git 路径')
            continue
        remote = git(repo, 'ls-remote', 'origin', remote_ref).split()
        if not remote:
            print(f'{name}：远端未取到；运行 git -C {shlex.quote(str(repo))} ls-remote origin {remote_ref}')
        elif head != remote[0] or git(repo, 'status', '--porcelain'):
            print(f'{name}：与远端有差异；先运行 git -C {shlex.quote(str(repo))} status')
        else:
            print(f'{name}：与远端一致（{head[:12]}）')

    fleet_skill = runtime / 'current/agent-fleet/skill'
    if not fleet_skill.is_dir():
        fleet_skill = source / 'agent-fleet/skill'
    for name, expected in [('agent-fleet', fleet_skill), ('rankup', source / 'rankup')]:
        link = Path.home() / '.agents/skills' / name
        if link.is_symlink() and expected.is_dir() and link.resolve() == expected.resolve():
            print(f'Skill {name}：软链目标正确')
        else:
            dest = shlex.quote(str(link))
            print(f'Skill {name}：软链目标有差异；移走旧安装后修复：test ! -e {dest} && test ! -L {dest} && '
                  f'ln -s {shlex.quote(str(expected))} {dest}')

    script = Path(config) / 'link.sh'
    if script.is_file():
        try:
            result = subprocess.run(['bash', str(script), '--check'], capture_output=True, timeout=5, cwd=config)
            print('全局软链：' + ('通过' if result.returncode == 0 else
                                  f'有差异；运行 bash {shlex.quote(str(script))} --check 检查'))
        except (OSError, subprocess.SubprocessError):
            print('全局软链：未取到')


def recently_used_scenes(root, cutoff):
    if not root:
        return set()
    try:
        _, rows = ledger_rows()
    except ValueError:
        return set()
    recent = set()
    for row in rows:
        if not isinstance(row, dict) or not row.get('project') or Path(row['project']).expanduser().resolve() != root:
            continue
        try:
            stamp = (row.get('startedAt') or row['date']).replace('Z', '+00:00')
            date = datetime.datetime.fromisoformat(stamp).timestamp()
        except (KeyError, TypeError, ValueError):
            continue
        if date >= cutoff:
            recent.update(row.get('scenes', []))
    return recent


def doctor(root):
    global_layer = Path.home() / '.agent-fleet'
    builtin = BLOCKS.parent / 'scenes'
    scenes = {name: path for name, path in scene_paths(root, warn=True).items() if path.parent != builtin}
    layers = [(global_layer, sorted((global_layer / 'scenes').glob('*.md')))]
    if root:
        layers.append((root / '.agent-fleet', list(scenes.values())))
    for directory, paths in layers:
        for level, path, message in memory_findings([*(directory / name for name in
                                                       ('README.md', 'lessons.md', 'patrol-brief.md')), *paths]):
            print(f'{level} {path}：{message}；编辑：${{EDITOR:-vi}} {shlex.quote(str(path))}')
    if root:
        if len(scenes) > 20:
            print('警告 项目场景超过 20 个；运行 fleet-go scenes 后合并或归档')
        env_file = root / '.agent-fleet/.env'
        if env_file.exists() and not order.git_ok(root, 'check-ignore', '-q', '--', str(env_file)):
            print(f'错误 {env_file} 未被 Git 忽略；在项目 .gitignore 加入 /.agent-fleet/.env，再运行 git check-ignore .agent-fleet/.env（已跟踪的文件需先移出索引）')
    path = order.order_path()
    if path.is_file():
        try:
            orders, _ = order.load(path)
            for executor, item in orders.items():
                if not item.active(order.now_local()):
                    print(f'过期调遣令 {executor}；修复：fleet-go order clear {executor}')
        except (ValueError, OSError):
            print(f'警告 调遣令无法读取；检查：${{EDITOR:-vi}} {shlex.quote(str(path))}')

    source = Path(__file__).resolve().parents[2]
    print('## 本机')
    target = path.resolve()
    config = order.repository(target) if target.parent.is_dir() else None
    machine_checks(source, config or global_layer)
    cutoff = time.time() - 90 * 86400
    recent = recently_used_scenes(root, cutoff) if scenes else set()
    if not mini.on_mini():
        print('## 远端执行机')
        fetched = False
        if mini.REMOTE_BIN:
            script = mini.PATH_FIX + mini.REMOTE_FLEET + 'import base64,datetime,json,os,shlex,subprocess,sys\nfrom pathlib import Path\n'
            script += '\n'.join(inspect.getsource(fn) for fn in (machine_checks, recently_used_scenes, ledger_rows))
            script += """
bin_path, config, project, cutoff = json.loads(base64.b64decode(sys.argv[1]))
binary = remote_fleet(bin_path)
machine_checks(binary.parents[2], config)
print(json.dumps(sorted(recently_used_scenes(Path(project).resolve() if project else None, cutoff))))
"""
            try:
                remote_project = mini.remote_path(str(root)) if scenes else None
                result = mini.call(script, [mini.REMOTE_BIN, mini.remote_path(str(config or global_layer)),
                                            remote_project, cutoff], timeout=25)
                if result.returncode == 0:
                    checks, used = result.stdout.rstrip().rsplit('\n', 1)
                    recent.update(json.loads(used))
                    print(checks)
                    fetched = True
            except (OSError, ValueError, subprocess.SubprocessError):
                pass
        if not fetched:
            print('未取到；检查远端连接和 FLEET_MINI_BIN 后重跑 fleet-go doctor')
    for name, path in scenes.items():
        if name not in recent and path.stat().st_mtime < cutoff:
            print(f'候选删除场景 {name}：已取得的账本中 90 天内无使用记录；先查看：cat {shlex.quote(str(path))}')


def select_scenes(args, body, project):
    if args.scene == 'none':
        return []
    scenes = dispatch_scenes(project)
    if args.scene is not None:
        names = list(dict.fromkeys(name.strip() for name in args.scene.split(',')))
        unknown = [name for name in names if name not in scenes]
        if unknown:
            hint = fix_hint(lambda argv: replace_option(argv, '--scene', 'none'))
            raise ValueError('未知场景：' + ', '.join(unknown) + '。请用 fleet-go scenes 查看。' + hint)
    else:
        query = re.sub(r'^##?\s*入口[^\n]*\n.*?(?=^##?\s|\Z)', '', body, flags=re.M | re.S)
        query = ((args.goal or '') + '\n' + query).casefold()
        names = [name for name, (data, _) in scenes.items()
                 if any(keyword.casefold() in query for keyword in data['keywords'] if keyword.strip())]
        if len(names) > 1:
            message = '匹配多个场景：' + ', '.join(names) + '。请指定 --scene <名> 或 --scene none。'
            if strict_dispatch():
                raise ValueError(message)
            print('提示：' + message + ' 本次跳过自动场景。', file=sys.stderr)
            return []
        if names:
            print('已自动带场景 ' + names[0], file=sys.stderr)
    return [(name, *scenes[name]) for name in names]


def scene_default(scenes, field):
    values = {data[field] for _, data, _ in scenes if data.get(field)}
    if len(values) > 1:
        option = '档位（如 --simple、--sol、--tier）' if field == 'tier' else '--' + field
        message = f'场景默认值冲突，请显式指定 {option}。'
        if strict_dispatch():
            raise ValueError(message)
        print('提示：' + message + ' 本次使用命令默认值。', file=sys.stderr)
        return None
    return next(iter(values), None)


def entry_repo(text):
    entry_match = re.search(r'^##?\s*入口\s*[:：]?\s*\n(.*?)(?=^##?\s|\Z)', text, re.M | re.S)
    entry = entry_match.group(1) if entry_match else ''
    match = re.search(r'^仓库[ \t]*[:：][ \t]*([^\s，,；;（(]+)', entry, re.M)
    return match.group(1).strip('`') if match else None


def dispatch_lessons(text):
    repo = entry_repo(text)
    if not repo or re.search(r'^## 派单场景 · ', text, re.M):
        return text
    text = re.sub(r'^项目派单经验：.*（派单前先读）\n?', '', text, flags=re.M)
    root = project_root(repo)
    if root:
        for name in ('infra/13-dispatch-kit.md', 'dispatch.md'):
            lesson = root / '.rankup' / name
            if lesson.is_file():
                line = f'项目派单经验：{lesson}（派单前先读）'
                print(line, flush=True)
                return text.replace('## 已知坑', '## 已知坑\n' + line, 1) if '## 已知坑' in text else text + '\n## 已知坑\n' + line + '\n'
    return text


def quota_fallback(target, review, original):
    if target != 'gpt':
        return None
    now = order.now_local()
    try:
        orders, _ = order.load(now=now)
    except (OSError, order.OrderError, UnicodeDecodeError):
        orders = {}
    codex = orders.get('codex')
    stopped = codex and codex.active(now) and codex.state == '停用'
    if stopped and not codex.is_auto:
        return None
    exhausted = bool(stopped and codex.is_auto)
    try:
        quota = json.loads((Path(os.environ.get('AGENT_FLEET_RUNS_DIR') or Path.home() / '.agent-fleet/runs') / 'codex-quota.json').read_text())
        exhausted |= float(quota['usedPercent']) >= 100 and float(quota['resetsAt']) > time.time()
    except (OSError, ValueError, TypeError, KeyError):
        pass
    if not exhausted:
        return None
    raise ValueError('Codex 订阅额度已耗尽，请由派单方改派。')


def relaunch(name, to=None, tier=None, simple=False, fast=False, no_fast=False, luna=False, high=False, xhigh=False, max=False, low=False, on=None, pull=False, sol=False, after=None, worktree_base=None, override_order=None, local_reason=None, astra=False, keep_brief=False):
    """复用既有 brief 元信息启动；amend 重启与独立 relaunch 共用此入口。"""
    if mini.on_mini() and (on is None or (on == 'local' and not (local_reason or '').strip())):
        if on is None:
            print('提示：检测到已在 Mini 本机运行，自动使用 --on local（不放宽授权）。', file=sys.stderr)
        on = 'local'
        local_reason = (local_reason or '').strip() or '已在 Mini 本机运行'
    if on == 'local' and not (local_reason or '').strip():
        hint = fix_hint(lambda argv: replace_option(argv, '--local-reason', '本机执行理由'))
        raise ValueError('--on local 必须同时提供 --local-reason 理由。' + hint)
    if local_reason and on != 'local':
        hint = fix_hint(lambda argv: replace_option(argv, '--on', 'local'))
        raise ValueError('--local-reason 仅用于 --on local。' + hint)
    path, meta = locate(name)
    old_to = meta['to']
    old_tier = gpt_tier(meta) if old_to == 'gpt' else meta.get('tier')
    name = meta.get('name') or path.name[:-len('.brief.md')]
    override = override_order or meta.get('order_override')
    original = ', '.join([gpt_tier(meta)] + [f'--{k}' for k, v in [('simple', simple), ('sol', sol), ('astra', astra), ('luna', luna), ('fast', fast), ('no-fast', no_fast), ('low', low), ('high', high), ('xhigh', xhigh), ('max', max)] if v])
    attempt = SimpleNamespace(attempt_id=str(uuid.uuid4()), name=name)
    fallback = dispatch_gate(attempt, 'order', lambda: quota_fallback(to or meta['to'], meta.get('review'), original))
    if fallback:
        to = 'openai'
        simple = fast = no_fast = luna = high = xhigh = max = low = sol = astra = False
        meta['fallback_deviation'] = fallback
    deviation = dispatch_gate(attempt, 'order', lambda: order.gate(to or meta['to'], override))
    text = path.read_text()
    if not keep_brief:
        text = refresh_body(path, meta, text)
    secrets = list(secret_findings(text))
    if secrets:
        raise ValueError('\n'.join(secrets))
    if fallback:
        lines = text.splitlines(keepends=True)
        text = ''.join(lines[:2]) + '\n' + fallback + '\n' + ''.join(lines[2:])
    if deviation:
        meta['order_override'] = override
        if '调遣令偏差：' not in text:
            lines = text.splitlines(keepends=True)
            text = ''.join(lines[:2]) + '\n' + deviation + '\n' + ''.join(lines[2:])
    candidates = [r for r in running(False, name=name, brief=str(path)) if r.get('briefPath') == str(path) or r.get('name') == name]
    if any(r.get('status') in ('running', 'queued', 'parked', 'waiting', 'unreachable') for r in candidates):
        raise ValueError('同名任务仍未结束；需要重启请用 amend --restart，未重复派发。')
    if on == 'local' and (to or meta['to']) == 'gpt':
        for previous in sorted(candidates, key=lambda r: r.get('startedAt') or r.get('runId') or '', reverse=True)[:1]:
            run_id = previous.get('runId')
            runs_root = Path(os.environ.get('AGENT_FLEET_RUNS_DIR', str(Path.home() / '.agent-fleet/runs')))
            yielded = runs_root / (str(run_id) + '.yield')
            if yielded.exists():
                state = json.loads(yielded.read_text())
                if state.get('type') == 'park' and not state.get('resolvedAt'):
                    meta['on'], meta['local_reason'] = 'local', local_reason
                    lines = path.read_text().splitlines(keepends=True)
                    if '本机执行偏差：' + local_reason.strip() not in ''.join(lines):
                        path.write_text(''.join(lines[:2]) + '\n本机执行偏差：' + local_reason.strip() + '\n' + ''.join(lines[2:]))
                    path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
                    os.execvp('fleet', ['fleet', 'resume', run_id])
    target = to or meta['to']
    if tier and target != 'claude':
        raise ValueError('--tier 仅用于 --to claude。')
    if simple and target != 'gpt':
        raise ValueError('--simple 仅用于 --to gpt。')
    if sum([simple, sol, luna, astra]) > 1:
        raise ValueError('--sol、--simple、--luna 和 --astra 不能同用。')
    if (sol or luna or astra) and target != 'gpt':
        raise ValueError('--sol、--luna 和 --astra 仅用于 --to gpt。')
    selected = ('astra' if astra else 'sol' if sol else 'terra' if simple else 'luna' if luna else gpt_tier(meta) if meta['to'] == 'gpt' else 'terra')
    selected_luna = target == 'gpt' and selected == 'luna'
    selected_simple = target == 'gpt' and selected == 'terra'
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
    text = ensure_principles(dispatch_lessons(text))
    if target == 'gpt' and selected in ('sol', 'astra') and OBSTACLE_NOTE not in text:
        text = text.replace(rule(), OBSTACLE_NOTE + '\n\n' + rule(), 1)
    if on != 'local' and not mini.available():
        hint = fix_hint(
            lambda argv: replace_option(replace_option(argv, '--on', 'local'), '--local-reason', 'Mini不可达改本机'),
            label='如确认改在本机执行，可复制修正命令：',
        )
        raise ValueError('Mini 不可达；请在 Mini 补齐（建 worktree、同步目录）后重派。' + hint)
    if target == 'gemini' and meta.get('type') not in ('copy', 'translation') and not meta.get('bulk'):
        meta['gemini_agent'] = True
        if worktree_base is None: worktree_base = ''
    else:
        meta.pop('gemini_agent', None)
    recorded, recorded_location = recorded_worktree(meta)
    if recorded and not worktree_call({**recorded, 'action': 'exists'}, recorded_location)['exists']:
        rebuild = shlex.join(['fleet-go', 'worktree', 'recreate', str(path)])
        if not recorded.get('base'):
            rebuild += ' --base <原环境分支，如 origin/main>'
        raise ValueError(f"本单 worktree 已移除：{recorded['path']}\n先重建再重派：{rebuild}")
    if worktree_base is not None:
        location = on or 'mini'
        existing = meta.get('worktree')
        if existing and meta.get('worktree_location', 'local') != location:
            old = mini.local_path(existing['path']) if meta.get('worktree_location') == 'mini' else existing['path']
            repo = mini.local_path(existing['repo']) if meta.get('worktree_location') == 'mini' else existing['repo']
            text = text.replace(old, repo)
            for key in ('paths', 'writes', 'parameterPaths'):
                meta[key] = [repo + v[len(old):] if v == old or v.startswith(old + '/') else v for v in meta.get(key, [])]
            meta['object']['repo'] = repo
            meta['object']['writes'] = [repo + v[len(old):] if v == old or v.startswith(old + '/') else v for v in meta['object']['writes']]
            meta.pop('worktree')
        wt = meta.get('worktree') or prepare_worktree(name, (meta.get('object') or {}).get('writes') or meta.get('writes', []), worktree_base, location, (meta.get('object') or {}).get('repo') or None)
        if meta.get('worktree'):
            worktree_call(wt, meta.get('worktree_location', location))
        else:
            text = rewrite_worktree(text, meta, wt, location)
    meta['paths'] = list(dict.fromkeys([*meta.get('parameterPaths', meta.get('writes', [])), *entry_paths(text)]))
    text = normalize_brief(text, target, meta.get('report'))
    meta['auth'] = infer_local_auth(text, meta.get('auth', []))
    dispatch_gate(attempt, 'lint', lambda: checked(text, target, bool(selected_simple), on or 'mini', True, target == 'gpt' and selected in ('sol', 'astra'), meta.get('no_lint', False), project=meta.get('project'), auth=meta.get('auth', ()), review=meta.get('review', False)))
    path.write_text(text)
    if target != meta['to']:
        meta.pop('tier', None)
        for option, products in [('tier', ['claude']), ('review', ['gpt', 'grok']),
                                 ('low', ['gpt', 'gemini']), ('high', ['gpt', 'gemini']), ('xhigh', ['gpt', 'gemini']), ('max', ['gpt']), ('simple', ['gpt']), ('sol', ['gpt']), ('luna', ['gpt']), ('astra', ['gpt']), ('fast', ['gpt']), ('no-fast', ['gpt']), ('model', ['grok']), ('subagents', ['grok']),
                                 ('bulk', ['gemini'])]:
            if target not in products:
                meta.pop(option, None)
        if target == 'gpt' and not selected_luna:
            meta.pop('xhigh', None)
            meta.pop('max', None)
    action_match = re.search(r'^动作[ \t]*[:：][ \t]*(.*)$', text, re.M)
    if action_match:
        meta['actions'] = parse_actions(action_match.group(1))
        meta['temporary_cwd'] = repository_free(text, set(meta['actions'])) and not entry_repo(text)
    meta.update(to=target, name=name, brief=str(path), attemptId=attempt.attempt_id)
    meta['on'] = on or 'mini'
    meta['local_reason'] = local_reason if on == 'local' else None
    if on == 'local' and '本机执行偏差：' + local_reason.strip() not in path.read_text():
        lines = path.read_text().splitlines(keepends=True)
        path.write_text(''.join(lines[:2]) + '\n本机执行偏差：' + local_reason.strip() + '\n' + ''.join(lines[2:]))
    if after is not None: meta['after'] = after
    meta['pull'] = pull
    if tier:
        meta['tier'] = tier
    if target == 'gpt':
        meta['tier'] = selected
        meta['simple'], meta['sol'], meta['luna'], meta['astra'] = selected == 'terra', selected == 'sol', selected == 'luna', selected == 'astra'
    if (sol or astra) and not (low or high or xhigh or max):
        meta['xhigh'] = meta['max'] = False
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
    if fallback:
        meta['reroute_reason'] = 'quota-fallback:codex->openai'
    elif target != old_to:
        meta['reroute_reason'] = f'relaunch:{old_to}->{target}'
    elif target == 'gpt' and selected != old_tier:
        meta['reroute_reason'] = f'relaunch:tier:{old_tier}->{selected}'
    path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
    dispatch_gate(attempt, 'lint', lambda: launch(meta), category='preflight')


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


def restart(run, path, name, on=None, local_reason=None, relaunch_fn=relaunch):
    """amend 调用：等待本次停止；非 runId 明确归属的残留只告警，不误挡邻居。"""
    subprocess.run(['fleet', 'stop', run['runId']], check=True, capture_output=True, text=True)
    deadline = time.monotonic() + 60
    while True:
        row = next((r for r in running(False, name=name, brief=str(path)) if r['runId'] == run['runId']), None)
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
    relaunch_fn(name, on=on, local_reason=local_reason)


def amend(args):
    """保留修订正文，按需插话或停止本次 run 后通过 relaunch 重启。"""
    path, meta = locate(args.name)
    args.name = meta.get('name') or path.name[:-len('.brief.md')]
    originals = {p: p.read_bytes() for p in (path, path.with_suffix('.json'))}
    def relaunch_amended(*a, **kw):
        try:
            return relaunch(*a, **kw)
        except Exception:
            for p, content in originals.items():
                p.write_bytes(content)
            print('重派前置失败，已恢复修订前的 brief 和元数据。', file=sys.stderr)
            raise
    if args.simple or args.sol or args.luna or args.astra or args.low or args.high or args.xhigh or args.max:
        if (args.simple or args.sol or args.luna or args.astra or args.max) and meta['to'] != 'gpt':
            raise ValueError('--sol、--simple、--luna、--astra 和 --max 仅用于 --to gpt。')
        if (args.low or args.high or args.xhigh) and meta['to'] not in ('gpt', 'gemini'):
            raise ValueError('--low、--high 和 --xhigh 仅用于 --to gpt|gemini。')
        if sum([args.simple, args.sol, args.luna, args.astra]) > 1:
            raise ValueError('--sol、--simple、--luna 和 --astra 不能同用。')
        if (args.luna and meta.get('review')) or (args.luna and args.simple):
            raise ValueError('--luna 和 --simple 不能同用，也不能与 --review 同用。')
        if sum([args.low, args.high, args.xhigh, args.max]) > 1:
            raise ValueError('--low、--high、--xhigh 和 --max 不能同用。')
        if meta['to'] == 'gpt' and (args.xhigh or args.max) and not (args.luna or (not args.simple and not args.sol and not args.astra and gpt_tier(meta) == 'luna')):
            raise ValueError('--xhigh 和 --max 仅用于 --luna。')
        if meta['to'] == 'gpt':
            selected = 'astra' if args.astra else 'sol' if args.sol else 'terra' if args.simple else 'luna' if args.luna else gpt_tier(meta)
            meta['tier'] = selected
            meta['simple'], meta['sol'], meta['luna'], meta['astra'] = selected == 'terra', selected == 'sol', selected == 'luna', selected == 'astra'
            if (args.sol or args.astra) and not (args.low or args.high or args.xhigh or args.max):
                meta['xhigh'] = meta['max'] = False
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
    if args.on is not None:
        meta['on'] = args.on
    if meta['to'] == 'gpt' and meta.get('tier') not in ('terra', 'sol', 'luna', 'astra'):
        meta['tier'] = gpt_tier(meta)
    original = path.read_text()
    secrets = list(secret_findings(original + '\n' + args.message))
    if secrets:
        raise ValueError('\n'.join(secrets))
    original = normalize_brief(original, meta['to'], meta.get('report'))
    if meta['to'] == 'gpt' and gpt_tier(meta) in ('sol', 'astra') and OBSTACLE_NOTE not in original:
        original = original.replace(rule(), OBSTACLE_NOTE + '\n\n' + rule(), 1)
    if args.auth is not None:
        auth = args.auth.split(',')
        bad_auth = [a for a in auth if a not in AUTH]
        if bad_auth:
            suggested = ','.join(dict.fromkeys(a for a in auth if a in AUTH)) or 'local'
            hint = fix_hint(lambda argv: replace_option(argv, '--auth', suggested))
            raise ValueError('未知授权块：' + ','.join(bad_auth) + '。可用：' + ','.join(AUTH) + hint)
        if 'local-commit' in auth: auth = [a for a in auth if a != 'local']
        values = {'NAME': args.name, 'REPORT': meta['report'], 'DATE': datetime.date.today().isoformat()}
        original = re.sub(r'(?<=## 授权覆盖\n).*?(?=\n动作[ \t]*[:：]|\n## |\Z)', lambda _: (('授权块：' + ','.join(auth) + '\n') if not strict_dispatch() else '') + '\n\n'.join(block('auth-' + a, values) for a in dict.fromkeys(auth)) + '\n', original, count=1, flags=re.S)
        meta['auth'] = auth
    if args.task_action is not None:
        if re.search(r'^动作[ \t]*[:：]', original, re.M):
            original = re.sub(r'^动作[ \t]*[:：].*$', lambda _: '动作: ' + args.task_action, original, count=1, flags=re.M)
        else:
            original = original.replace('## 授权覆盖', '动作: ' + args.task_action + '\n\n## 授权覆盖', 1)
    latest_revision = re.search(r'^## 【修订 \d+（[^\n]+）】\n', original, re.M)
    if latest_revision and original[latest_revision.end():].startswith(args.message + '\n\n'):
        print('相同修订已存在，未重复插入。')
    else:
        numbers = [int(n) for n in re.findall(r'^## 【修订 (\d+)（', original, re.M)]
        lines = original.splitlines(keepends=True)
        stamp = datetime.datetime.now().isoformat(timespec='seconds')
        revised = ''.join(lines[:2]) + f'\n## 【修订 {max(numbers, default=0) + 1}（{stamp}）】\n{args.message}\n\n' + ''.join(lines[2:])
        original = revised
    if not strict_dispatch():
        previous_auth = meta.get('auth', [])
        meta['auth'] = infer_local_auth(original, previous_auth)
        if meta['auth'] != previous_auth:
            original = original.replace('## 授权覆盖\n', '## 授权覆盖\n授权块：local-commit\n', 1)
    sensitive_text = (args.message + '\n' + (args.task_action or '')) if args.say else None
    if args.auth is not None or args.task_action is not None:
        checked(original, meta['to'], gpt_tier(meta) == 'terra' and meta['to'] == 'gpt', args.on or meta.get('on') or 'local', True, gpt_tier(meta) in ('sol', 'astra'), meta.get('no_lint', False), project=meta.get('project'), auth=meta.get('auth', ()), sensitive_text=sensitive_text, review=meta.get('review', False))
    else:
        checked(original, meta['to'], no_lint=meta.get('no_lint', False), auth=meta.get('auth', ()), sensitive_text=sensitive_text, review=meta.get('review', False))
    original = normalize_actions(original)
    path.write_text(original)
    if not (latest_revision and original[latest_revision.end():].startswith(args.message + '\n\n')):
        print(f'已修订：{path}', flush=True)
    action_match = re.search(r'^动作[ \t]*[:：][ \t]*(.*)$', path.read_text(), re.M)
    if action_match:
        meta['actions'] = parse_actions(action_match.group(1))
        meta['temporary_cwd'] = repository_free(original, set(meta['actions'])) and not entry_repo(original)
    path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
    remote = mini.find(args.name) if meta.get('execution') == 'mini' else None
    if remote and not remote.get('local'):
        if args.say and mini.query(remote).get('status') not in ('running', 'waiting', 'abnormal'):
            print('没有运行中的 run：按修订后的 brief 直接 relaunch。', flush=True)
            relaunch_amended(args.name, on=args.on, local_reason=args.local_reason)
            return
        if args.restart:
            if mini.forward(['stop', remote['id']]): raise ValueError('Mini 停止失败。')
            relaunch_amended(args.name, on=args.on, local_reason=args.local_reason)
            return
        remote_brief = mini.remote_path(str(path))
        script = "import base64,json,pathlib,sys\np=json.loads(base64.b64decode(sys.argv[1]))\n" + mini.CANONICAL_SCRIPT + "\npathlib.Path(canonical(p['path'])).write_text(canonical(p['text']))\n"
        res = mini.call(script, {'path': remote_brief, 'text': mini.rewrite_brief(path.read_text()), 'home': mini.REMOTE_HOME})
        if res.returncode: raise ValueError('Mini 修订同步失败。')
        if args.say:
            sys.exit(mini.forward(['say', remote['id'], args.message]))
        return
    if not args.say and not args.restart:
        return
    matches = [r for r in running(name=args.name, brief=str(path)) if r.get('state', r.get('status')) in ('running', 'waiting')
               and (r.get('briefPath') == str(path) or r.get('name') == args.name)]
    if not matches and args.say:
        # 上一轮已结束（常见：部分完成后交回）：修订已写入 brief，直接按修订后的 brief 续派，省掉单独 relaunch
        print('没有运行中的 run：按修订后的 brief 直接 relaunch。', flush=True)
        relaunch_amended(args.name, on=args.on, local_reason=args.local_reason)
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
    restart(run, path, args.name, args.on, args.local_reason, relaunch_amended)


def level_arg(value):
    """难度档 L1–L4，也接受 1–4，统一存成 L1–L4。"""
    match = re.fullmatch(r'[Ll]?([1-4])', value)
    if not match:
        raise argparse.ArgumentTypeError('难度档只能是 L1–L4。')
    return 'L' + match.group(1)


NONCAP = [('quota', '额度'), ('capacity', '容量/429'), ('zombie', '僵尸'), ('stopped', '被停'), ('auth-gateway', '鉴权/网关')]
MIN_SAMPLE = 8


def ledger_rows(allow_missing=False):
    """读账本 ~/.agent-fleet/ledger.jsonl（环境变量 AGENT_FLEET_LEDGER 可改路径）；坏行跳过。"""
    path = Path(os.environ.get('AGENT_FLEET_LEDGER') or Path.home() / '.agent-fleet/ledger.jsonl')
    if not path.exists():
        if allow_missing:
            return path, []
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


def fault_score(rows, args):
    lower, upper = args.since or '', args.until or '9999-12-31'
    rejects = [r for r in gate_rows() if not r.get('preview') and lower <= r.get('date', '') <= upper]
    resolver = Path(__file__).with_name('verdict.mjs').as_uri()
    script = f"""import {{ outcomeFor }} from '{resolver}';
import {{ readFileSync }} from 'node:fs';
console.log(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(r => outcomeFor(r.verdict,r.pending))));"""
    outcomes = json.loads(subprocess.run(['node', '--input-type=module', '-e', script],
                                         input=json.dumps(rows), capture_output=True, text=True, check=True).stdout)
    count = len(rows)
    partial = [r for r in rows if r.get('outcome') == 'partial']
    snapshots = [r for r in rows if 'snapshot-patrol' in (r.get('scenes') or [])]
    runs = Path(os.environ.get('AGENT_FLEET_RUNS_DIR') or Path.home() / '.agent-fleet/runs')
    no_progress = unknown_progress = 0
    for row in rows:
        if 'noProgress' in row:
            no_progress += bool(row['noProgress'])
            continue
        run_id = row.get('runId', '')
        try:
            if not run_id or Path(run_id).name != run_id:
                raise ValueError('invalid run id')
            state = json.loads((runs / f'{run_id}.json').read_text())
            stop = state.get('continueStop') or (state.get('brief') or {}).get('continueStop', '')
            no_progress += bool(re.search(r'无进展|无新证据', stop or ''))
        except (OSError, ValueError, AttributeError):
            unknown_progress += 1
    examples = subprocess.run(['node', str(BLOCKS.parents[2] / 'test/dispatch-examples.mjs')], capture_output=True, text=True, timeout=90)
    example_rows = json.loads(examples.stdout)
    passed = sum(r['status'] == 'pass' for r in example_rows)
    deferred = sum(r['status'] == 'deferred' for r in example_rows)
    stages = {r.get('stage') for r in rejects} & {'lint', 'order', 'queue', 'launch-hook'}
    pending = {p: sum(r.get('pending') == p and r.get('verdict') == 'ok' for r in rows)
               for p in ('external', 'downstream', 'rolled-back', 'handoff')}
    print(f'日期窗：{lower or "最早"} 至 {args.until or "最新"}（含两端）')
    print(f'判定与 outcome 不一致：{sum(r.get("outcome") != o for r, o in zip(rows, outcomes))}/{count}')
    print(f'无进展续做停机：{no_progress}/{count}；缺历史状态 {unknown_progress}')
    print(f'部分完成：{len(partial)}/{count}；pending={json.dumps(pending)}')
    report_overlap = sum(1 for r in rejects if r.get('category') == 'report-overlap' or (
        r.get('category') == 'write-overlap' and re.search(r'/(?:\.agent-reports|\.agent-fleet/reports)(?:/|\b)', r.get('reason') or '')))
    print(f'涉及报告路径的重叠拒绝：{report_overlap}')
    print(f'示例 dry-run（当前版本）：{passed}/{len(example_rows) - deferred}；等待内联正文 {deferred}')
    print(f'拒绝落账覆盖阶段：{len(stages)}/4（{", ".join(sorted(stages)) or "无样本"}）')
    print(f'快照巡检部分完成：{sum(r.get("outcome") == "partial" for r in snapshots)}/{len(snapshots)}')



def score(args):
    """只读账本，按执行者给出计数；不设总分权重。样本少于 8 的标「样本不足」。"""
    path, rows = ledger_rows(allow_missing=args.fault_window)
    total_rows = len(rows)
    for flag, value in (('--since', args.since), ('--until', args.until)):
        if value:
            if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value):
                raise ValueError(f'{flag} 需要 YYYY-MM-DD。')
            datetime.date.fromisoformat(value)
    if args.since and args.until and args.since > args.until:
        raise ValueError('--since 不得晚于 --until。')
    rows = [r for r in rows if (not args.since or (r.get('date') or '') >= args.since)
            and (not args.until or (r.get('date') or '') <= args.until)]
    if args.fault_window:
        return fault_score(list({r['runId']: r for r in rows if r.get('runId')}.values()), args)
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


def report_writes(paths, report):
    target = Path(report).resolve()
    checkpoint = target.with_suffix('.checkpoint.md')
    roots = [root.resolve() for root in clean.report_roots()]
    return list(dict.fromkeys(report if target.is_relative_to(Path(p).resolve()) and
                              any(Path(p).resolve().is_relative_to(root) for root in roots) else p
                              for p in paths if Path(p).resolve() not in (target, checkpoint) or p == report))


def narrow_report_entry(body, report):
    def rewrite(section):
        def narrow(declaration):
            paths = entry_write_paths(declaration.group())
            scoped = report_writes(paths, report)
            if paths == scoped:
                return declaration.group()
            return '可写路径: ' + '、'.join(scoped or [report])
        return WRITE_DECLARATION.sub(narrow, section.group())
    return re.sub(r'^## 入口[ \t]*\n[\s\S]*?(?=^## |\Z)', rewrite, body, count=1, flags=re.M)


def retry_metadata(path):
    try:
        meta = json.loads(path.with_suffix('.json').read_text())
    except (OSError, ValueError):
        return None
    if meta.get('execution') == 'failed' or (meta.get('attemptId') and any(
            r.get('attemptId') == meta['attemptId'] and r.get('stage') == 'queue' for r in gate_rows())):
        return meta
    return None


def new(args, prepare=False):
    """组装标准 brief；预览不写盘，正文文件与 stdin 使用明确输入规则。"""
    args.attempt_id = str(uuid.uuid4())
    args.gate_stage = None
    if not getattr(args, '_mini_resolved', False):
        resolve_on_mini_location(args)
        args._mini_resolved = True
    if args.on == 'local' and not (args.local_reason or '').strip():
        hint = fix_hint(lambda argv: replace_option(argv, '--local-reason', '本机执行理由'))
        raise ValueError('--on local 必须同时提供 --local-reason 理由。' + hint)
    if args.local_reason and args.on != 'local':
        hint = fix_hint(lambda argv: replace_option(argv, '--on', 'local'))
        raise ValueError('--local-reason 仅用于 --on local。' + hint)
    if args.body and args.body != '-':
        body_path = Path(args.body).expanduser()
        try:
            is_file = body_path.is_file()
        except OSError:
            is_file = False
        if not is_file:
            hint = fix_hint(
                lambda argv: replace_option(argv, '--body', '-'),
                suffix=" <<'BRIEF'\n<正文内容>\nBRIEF",
            )
            raise ValueError(f'--body 不是文件路径：{diagnostic_path(body_path)}；--body 需要文件路径，用 - 读取 stdin。' + hint)
        body = body_path.read_text()
        body_file = str(body_path.resolve())
    else:
        body_file = None
        body = sys.stdin.read() if args.body == '-' or not sys.stdin.isatty() else ''
    if not args.goal and not body.strip():
        hint = fix_hint(lambda argv: replace_option(argv, '--goal', '请填写任务目标'))
        raise ValueError('请提供 --goal、--body 或 stdin 正文。' + hint)
    secrets = list(secret_findings(body + '\n' + '\n'.join(sys.argv[1:])))
    if secrets:
        raise ValueError('\n'.join(secrets))
    args.write = [mini.expand_path(path) for path in mini.split_paths(args.write or [])]
    project = resolve_project(args.project, entry_repo(body))
    scenes = select_scenes(args, body, project)
    if args.auth is None:
        args.auth = scene_default(scenes, 'auth') or 'local'
    if args.task_action is None and not re.search(r'^动作[ \t]*[:：]', body, re.M):
        args.task_action = scene_default(scenes, 'action')
    if args.to == 'gpt' and not (args.simple or args.sol or args.astra or args.luna or args.xhigh or args.max):
        tier = scene_default(scenes, 'tier')
        if tier in ('terra', 'sol', 'astra', 'luna'):
            setattr(args, 'simple' if tier == 'terra' else tier, True)
    if args.to == 'claude' and args.tier is None:
        tier = scene_default(scenes, 'tier')
        if tier in ('haiku', 'sonnet', 'opus'):
            args.tier = tier
    original = ', '.join([('astra' if args.astra else 'sol' if args.sol else 'luna' if args.luna else 'terra')] + [f'--{k.replace("_", "-")}' for k in ('simple', 'sol', 'astra', 'luna', 'fast', 'no_fast', 'low', 'high', 'xhigh', 'max') if getattr(args, k)])
    fallback = dispatch_gate(args, 'order', lambda: quota_fallback(args.to, args.review, original))
    if fallback:
        args.to = 'openai'
        for key in ('simple', 'sol', 'astra', 'luna', 'fast', 'no_fast', 'low', 'high', 'xhigh', 'max'):
            setattr(args, key, False)
    deviation = dispatch_gate(args, 'order', lambda: order.gate(args.to, args.override_order))
    for option, products in [('tier', ['claude']), ('review', ['gpt', 'grok']),
                             ('low', ['gpt', 'gemini']), ('high', ['gpt', 'gemini']), ('xhigh', ['gpt', 'gemini']), ('max', ['gpt']), ('simple', ['gpt']), ('sol', ['gpt']), ('luna', ['gpt']), ('astra', ['gpt']), ('model', ['grok']), ('subagents', ['grok']),
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
    if sum([args.sol, args.simple, args.luna, args.astra]) > 1:
        raise ValueError('--sol、--simple、--luna 和 --astra 不能同用。')
    if args.make == 'video' and args.to != 'grok':
        raise ValueError('--make video 仅用于 --to grok。')
    if args.for_name and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', args.for_name):
        raise ValueError('--for 需要被复核的任务名（字母、数字、下划线与连字符）。')
    day = datetime.date.today().isoformat()
    folder = clean.report_roots()[0] / day
    path = folder / (args.name + '.brief.md')
    retry = retry_metadata(path) if path.exists() and not args.dry_run else None
    if not strict_dispatch():
        if report_matches(args.name + '.brief.md'):
            candidates = [r for r in running(False, name=args.name) if r.get('name') == args.name]
            if any(r.get('status', r.get('state')) in ('running', 'queued', 'parked', 'waiting', 'abnormal', 'unreachable') for r in candidates):
                next_name = next_available_name(args.name, folder)
                hint = fix_hint(lambda argv: replace_positional(argv, args.name, next_name))
                raise ValueError('同名任务仍未结束；未重复派发。' + hint)
            if retry is None and candidates:
                if args.report and Path(args.report).expanduser().exists():
                    new_report = next_available_report(args.report)
                    hint = fix_hint(lambda argv: replace_option(argv, '--report', new_report))
                    raise ValueError('指定报告已存在；请为新任务使用新报告路径。' + hint)
                original = args.name
                args.name = next_available_name(original, folder)
                path = folder / (args.name + '.brief.md')
                print(f'提示：{original} 已结束，本次改用 {args.name}，保留原产物。', file=sys.stderr)
    if args.report and Path(args.report).expanduser().exists() and not args.dry_run and retry is None:
        new_report = next_available_report(args.report)
        hint = fix_hint(lambda argv: replace_option(argv, '--report', new_report))
        raise ValueError('指定报告已存在；请为新任务使用新报告路径。' + hint)
    if any((root / day / path.name).exists() and (root / day / path.name != path or retry is None) for root in clean.report_roots()) and not args.dry_run:
        next_name = next_available_name(args.name, folder)
        hint = fix_hint(lambda argv: replace_positional(argv, args.name, next_name))
        raise ValueError(
            f'同名 brief 已存在，拒绝覆盖：{path}\n'
            f'改需求后重派：fleet-go amend {args.name} "<修订说明>" --say\n'
            f'原样重派（--body 文件改过会自动换进 brief）：fleet-go relaunch {args.name}\n'
            f'另起一单：把名字换成 {next_name} 重跑原命令' + hint
        )
    report = str(Path(args.report).expanduser().absolute()) if args.report else str(folder / (args.name + '.md'))
    body = narrow_report_entry(body, report)
    action = args.task_action or declared_action(body)
    auth = infer_local_auth('动作: ' + action, args.auth.split(','))
    if not strict_dispatch() and not args.review:
        body = fill_entry_writes(body, action, args.write, project, report)
    bad_auth = [a for a in auth if a not in AUTH]
    if bad_auth:
        suggested = ','.join(dict.fromkeys(a for a in auth if a in AUTH)) or 'local'
        hint = fix_hint(lambda argv: replace_option(argv, '--auth', suggested))
        raise ValueError('未知授权块：' + ','.join(bad_auth) + '。可用：' + ','.join(AUTH) + hint)
    if 'local-commit' in auth:
        auth = [a for a in auth if a != 'local']
    pitfalls = args.pitfalls.split(',') if args.pitfalls is not None else [
        key.removeprefix('pitfall-') for _, data, _ in scenes for key in data.get('blocks', [])]
    if args.pitfalls is None and 'deploy-prod' in auth:
        pitfalls.append('pnpm-entry')
        pitfalls.extend(p.stem[8:] for p in BLOCKS.glob('pitfall-deploy-*.md'))
    if any(p not in PITFALLS and not (BLOCKS / ('pitfall-' + p + '.md')).exists() for p in pitfalls if p):
        raise ValueError('未知已知坑块。')
    values = {'NAME': args.name, 'REPORT': report, 'DATE': day,
              'COMMITS': '本地提交仅限授权分支，报告列出本地提交哈希' if 'local-commit' in auth or 'deploy-prod' in auth else '本单不做 git 提交，报告不需要提交哈希'}
    classification = PRODUCTS[args.to] + (' 只读复核' if args.review else '')
    if args.to == 'claude':
        classification += ' ' + (args.tier or 'sonnet')
    is_review = bool(args.review or args.for_name or (args.type or '').lower() == 'review')
    orchestrator = args.type == 'orchestrate'
    if args.subagents and not orchestrator:
        raise ValueError('--subagents 仅用于明确标明 --type orchestrate 的总管单。')
    checkpoint = str(Path(report).with_suffix('.checkpoint.md'))
    values['CHECKPOINT'] = checkpoint
    style = block('style-sol', values)
    discipline = block('role-orchestrator' if orchestrator else 'role-single', values)
    responsibility = ('review' if is_review else 'orchestrator' if orchestrator else
                      'astra' if args.astra else 'sol' if args.sol else 'terra')
    model_role = block('model-' + responsibility, values) if args.to == 'gpt' and not args.luna else ''
    waiting = block('executor-wait', values) if args.to == 'gpt' else ''
    role = '\n'.join(part for part in (discipline, model_role, waiting) if part)
    parts = [f'归类：{classification}；理由：{args.why or classification + "任务，按既有路由执行"}\nREPORT: {report}', style + '\n' + role, block('time-box', values),
             '## 授权覆盖\n' + (('授权块：' + ','.join(auth) + '\n') if not strict_dispatch() else '') + '\n\n'.join(block('auth-' + a, values) for a in dict.fromkeys(auth))
             + ('\n\n推送范围：仅允许动作行明确要求的代码分支推送，部署、环境分支合入和线上写入须另有授权。'
                if not strict_dispatch() and 'local-commit' in auth and '推送' in action else '')]
    if args.task_action:
        parts.append('动作: ' + args.task_action)
    if args.budget:
        parts.append('## 预算与重试限制\n' + args.budget)
    if args.goal:
        parts.append('## 目标\n' + args.goal)
    if body.strip():
        content = body.strip()
        if not strict_dispatch() and not content.startswith(('## ', '动作:', '动作：')):
            content = '## 正文\n' + content
        parts.append(content)
    if project:
        general = project / '.agent-fleet/README.md'
        if general.is_file():
            lines = general.read_text().splitlines()
            if len(lines) > 60:
                print(f'警告：{general} 超过 60 行，已截断。', file=sys.stderr)
            # Quote project guidance so its headings and fields cannot satisfy brief gates.
            parts.append('## 项目派单总则\n' + '\n'.join('> ' + line for line in lines[:60]))
    if args.make:
        parts.append('## 产物要求\n' + block('make-' + args.make, {'OUTDIR': '/tmp/' + args.name + '/'}))
        if args.make == 'image':
            parts.append('执行方法：' + ('使用 imagegen Skill 和 Codex 内置 image_gen 工具。' if args.to == 'gpt' else 'Grok 使用内置 image_gen / image_edit 工具，model 参数留空。' if args.to == 'grok' else '使用当前产品可用的真实图片生成工具，生成受阻时如实报告缺口。'))
    writes = [report, checkpoint, '/tmp/' + args.name + '/', *report_writes(args.write, report)]
    parts.append('## 允许范围\n允许写：\n' + '\n'.join('- ' + p for p in dict.fromkeys(writes)) + '\n- 正文明确写了“允许读写”的路径（含源码仓与其 .git）\n只读：\n' + ('\n'.join('- ' + p for p in (args.read or [])) or '按正文指定路径读取。'))
    if args.forbid:
        parts.append('另行授权事项：' + args.forbid)
    pitfall_blocks = {f'pitfall-{p}': block('pitfall-' + p, values) for p in dict.fromkeys(pitfalls) if p}
    if pitfall_blocks:
        parts.append('## 已知坑\n' + '\n\n'.join(pitfall_blocks.values()))
    parts.extend(['## 验收\n' + (('产物清单：\n' + '\n'.join('- ' + item for item in args.deliverables) + '\n\n') if args.deliverables else '') + block('accept-boilerplate', values) + '\n\n' + block('report-template', values)
                  + ('\n\n' + block('review-ledger', values) if is_review else ''), rule()])
    repo = entry_repo(body)
    entry = re.search(r'^## 入口[ \t]*\n(.*?)(?=^## |\Z)', body, re.M | re.S)
    entry_writes = entry_write_paths(entry.group(1)) if entry else []
    object_ = {'repo': repo or '',
               'writes': [p for p in report_writes([*args.write, *entry_writes], report) if p != report],
               'environment': args.environment or '', 'question': args.question or args.goal or ''}
    if any(name == 'snapshot-patrol' for name, _, _ in scenes):
        window = re.search(r'^时间窗[：:] *(\S[^\r\n]*)', body, re.M)
        if not window:
            raise ValueError('快照巡检正文须填「时间窗: <起止时间>」。')
        object_['window'] = window.group(1).strip()
    parts.insert(2, '对象: ' + json.dumps(object_, ensure_ascii=False))
    if fallback:
        parts.insert(3, fallback)
    if deviation:
        parts.insert(3, deviation)
    if args.on == 'local': parts.insert(3, '本机执行偏差：' + args.local_reason.strip())
    used_ids = {int(n) for n in re.findall(r'^\s*(?:- )?V(\d+)\s', body, re.M)}
    def scene_acceptance(data):
        rows = []
        for item in data['acceptance']:
            match = re.match(r'V(\d+) ', item)
            if match:
                number = int(match.group(1))
                while number in used_ids:
                    number += 1
                used_ids.add(number)
                item = f'V{number} ' + item[match.end():]
            rows.append('- ' + item)
        return '\n'.join(rows)
    parts[1:1] = [f"## 派单场景 · {name}\n{data['description']}\n\n{content}"
                  + ('\n\n可写路径模板（由派单人填写）：' + '、'.join(data['writes']) if data.get('writes') else '')
                  + '\n\n验收要点：\n' + scene_acceptance(data)
                  for name, data, content in scenes]
    parts.insert(1, block('thinking-principles'))  # 思维准则：每单必带，紧随“归类/REPORT”首部，排在其余样板之前
    parts.append('临时文件只放 /tmp/' + args.name + '/。')
    text = normalize_actions(dispatch_lessons('\n\n'.join(parts) + '\n'))
    location = args.on or 'mini'
    if location == 'mini' and not (args.dry_run or args.no_launch or prepare) and not mini.available():
        hint = fix_hint(
            lambda argv: replace_option(replace_option(argv, '--on', 'local'), '--local-reason', 'Mini不可达改本机'),
            label='如确认改在本机执行，可复制修正命令：',
        )
        raise ValueError('Mini 不可达；请在 Mini 补齐（建 worktree、同步目录）后重派。' + hint)
    dispatch_gate(args, 'lint', lambda: checked(text, args.to, args.to == 'gpt' and not (args.sol or args.luna or args.astra), location, True, args.sol or args.astra, args.no_lint, project, auth=auth, review=args.review))
    action_match = re.search(r'^动作[ \t]*[:：][ \t]*(.*)$', body, re.M)
    actions = args.task_action or (action_match.group(1) if action_match else '')
    requested_workspace = getattr(args, 'workspace', None)
    if requested_workspace is None and os.environ.get('FLEET_GCP_WORKSPACE_EXPERIMENTAL') != '1':
        requested_workspace = 'local'
    workspace = choose_workspace(requested_workspace, pool='code' if '改代码' in parse_actions(actions) else 'light', gcp_enabled=True)
    parameter_paths = [*(mini.expand_path(p) for p in (args.read or [])), *report_writes(args.write, report)]
    temporary_cwd = repository_free(text, set(parse_actions(actions))) and not repo
    if temporary_cwd:
        print('提示：只读任务未指定仓库，将在空的临时工作目录运行。', file=sys.stderr)
    meta = {'workspace': workspace, 'temporary_cwd': temporary_cwd, 'attemptId': args.attempt_id, 'to': args.to, 'name': args.name, 'brief': str(path), 'report': report,
            'auth': auth, 'no_lint': args.no_lint, 'actions': parse_actions(actions),
            'tier': ('astra' if args.astra else 'luna' if args.luna else 'sol' if args.sol else 'terra') if args.to == 'gpt' else args.tier, 'review': args.review, 'sol': args.sol, 'astra': args.astra, 'low': args.low, 'high': args.high,
            'xhigh': True if (args.to == 'gemini' and not (args.low or args.high)) else args.xhigh,
            'max': args.max, 'simple': args.simple, 'luna': args.luna, 'fast': args.fast, 'no-fast': args.no_fast, 'model': args.model,
            'subagents': args.subagents, 'bulk': args.bulk, 'expect-changes': args.expect_changes,
            # 账本用：难度档、任务类型、被复核任务名；relaunch/amend 沿用 meta，不另存。
            'parameterPaths': parameter_paths,
            'paths': list(dict.fromkeys([*parameter_paths, *([repo] if repo else []), *report_writes(entry_writes, report)])),
            'writes': report_writes(args.write, report),
            'body': body_file, 'body_text': body.strip(), 'order_override': args.override_order if deviation else None, 'fallback_deviation': fallback,
            'prompt_template': f"v1/{'role-orchestrator' if orchestrator else 'role-single'}/{'model-' + responsibility if model_role else ('review' if is_review else args.to)}",
            'reroute_reason': 'quota-fallback:codex->openai' if fallback else None,
            'on': args.on or 'mini', 'local_reason': args.local_reason, 'pull': args.pull, 'object': object_ if object_['repo'] or object_['writes'] or object_.get('window') else None, 'after': args.after, 'level': args.level, 'type': (args.type or ('review' if is_review else 'media' if args.make else None)), 'for': args.for_name}
    if project:
        meta['project'] = str(project)
    if scenes:
        meta['scenes'] = [name for name, _, _ in scenes]
    if args.to == 'gemini' and args.type not in ('copy', 'translation') and not args.bulk:
        if not repo and not (args.dry_run or args.no_launch or prepare):
            raise ValueError('Gemini 非文案任务需要指定仓库以建立独立 worktree。')
        meta['gemini_agent'] = True
        if args.worktree is None: args.worktree = ''
    if args.worktree is not None and workspace == 'gcp':
        if args.worktree: meta['gcpx_branch'] = args.worktree
    elif args.worktree is not None and not (args.dry_run or prepare):
        wt = (retry or {}).get('worktree')
        if not wt or retry.get('worktree_location') != location:
            wt = prepare_worktree(args.name, object_['writes'], args.worktree, location, object_['repo'] or None)
        text = rewrite_worktree(text, meta, wt, location)
    if args.to == 'jev':
        meta['questions'] = str(path.with_suffix('.questions.json'))
    if prepare:
        return text, meta
    if args.dry_run:
        if meta['to'] == 'gpt':
            resolver = Path(__file__).resolve().with_name('model-family.mjs').as_uri()
            script = f"import {{resolveCodexModel}} from '{resolver}'; console.log(resolveCodexModel(process.argv[1]));"
            actual = subprocess.check_output(['node', '--input-type=module', '-e', script, meta['tier']], text=True).strip()
            print(f"模型：{meta['tier']} / {actual}", file=sys.stderr)
        if args.worktree is not None:
            print(f"将准备工作树：{object_['repo'] or '由 --write 推断'} / {args.name} / {args.worktree or '默认基点'}", file=sys.stderr)
        if 'deploy-prod' in auth and not re.search(r'^.*回滚(?:条件|出口|方案)', body, re.M):
            print('使用默认回滚：发布前版本或开关 0%。', file=sys.stderr)
        blocks = {'header': parts[0], 'thinking-principles': block('thinking-principles'),
                  'role': style + '\n' + role + '\n' + rule(), 'time-box': block('time-box', values),
                  'accept-boilerplate': block('accept-boilerplate', values), 'report-template': block('report-template', values),
                  **{f'auth-{a}': block(f'auth-{a}', values) for a in auth}, **pitfall_blocks}
        if is_review:
            blocks['review-ledger'] = block('review-ledger', values)
        total = sum(map(len, blocks.values()))
        print('样板字符数：' + ' '.join(f'{name}={len(value)}' for name, value in blocks.items()) +
              f'；样板占比 {total / len(text):.1%} ({total}/{len(text)})', file=sys.stderr)
        print(text, end='')
        print('\n将执行：' + shlex.join(command(meta)) + (f"（{gpt_tier(meta).capitalize()}）" if meta['to'] == 'gpt' else ''), file=sys.stderr)
        return
    folder.mkdir(parents=True, exist_ok=True)
    with (folder / '.dispatch.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if path.exists() and (not retry or retry_metadata(path) != retry):
            next_name = next_available_name(args.name, folder)
            hint = fix_hint(lambda argv: replace_positional(argv, args.name, next_name))
            raise ValueError(f'同名 brief 已存在，拒绝覆盖：{path}' + hint)
        with path.open('w' if retry else 'x') as file:
            file.write(text)
        if args.to == 'jev':
            Path(meta['questions']).write_text(json.dumps({'decision': {'type': 'noul', 'instructions': args.goal or body.strip()}}, ensure_ascii=False) + '\n')
        path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
    if args.no_launch:
        print(f'已生成：{path}')
    else:
        dispatch_gate(args, 'lint', lambda: launch(meta), category='preflight')


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
    def batch_writes(item, meta):
        obj = meta.get('object') or {}
        writes = [os.path.realpath(p) for p in obj.get('writes', [])]
        if item.worktree is None:
            return writes
        source = obj.get('repo') or (writes[0] if writes else '')
        while source and not os.path.isdir(source):
            source = os.path.dirname(source)
        root = subprocess.check_output(['git', '-C', source, 'rev-parse', '--show-toplevel'], text=True).strip()
        root = os.path.realpath(root)
        target = str(Path(root).parent / (Path(root).name + '-wt') / item.name)
        return [os.path.realpath(target + p[len(root):]) if p == root or p.startswith(root + '/') else p for p in writes]
    effective_writes = [batch_writes(item, meta) for item, _, meta in jobs]
    overlaps = {}
    for i, a in enumerate(effective_writes):
        for j, b in enumerate(effective_writes):
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
            active[meta['name']] = subprocess.Popen([sys.executable, __file__, 'relaunch', meta['name'], *(['--on', 'local', '--local-reason', meta['local_reason']] if meta.get('on') == 'local' else [])])
            pending.remove(job)
        for name, proc in list(active.items()):
            code = proc.poll()
            if code is not None:
                if code: failures.append(name)
                del active[name]
        if pending or active: time.sleep(0.1)
    if failures: raise ValueError('batch 任务失败：' + ', '.join(failures))


class DispatchParser(argparse.ArgumentParser):
    def error(self, message):
        if 'new' in sys.argv[1:2] and '--dry-run' in sys.argv:
            record_rejection(str(uuid.uuid4()), 'lint', 'input', '', message, True)
        retry = retry_command()
        super().error(message + ('\n修改后重跑：' + retry if retry else ''))


def build_parser():
    """解析公开命令入口；状态默认仅保留非终态及最近一小时。"""
    parser = DispatchParser(description='fleet-go：短参数组装标准 brief；前台执行 fleet。')
    sub = parser.add_subparsers(dest='action', required=True)
    p = sub.add_parser('new')
    p.add_argument('--quiet', action='store_true')
    p.add_argument('name')
    p.add_argument('--to', choices=PRODUCTS, required=True)
    p.add_argument('--on', choices=['mini', 'local'])
    p.add_argument('--local-reason')
    p.add_argument('--pull', action='store_true')
    p.add_argument('--tier', choices=['haiku', 'sonnet', 'opus', 'fable'])
    p.add_argument('--model')
    p.add_argument('--make', choices=['image', 'video'])
    for option in ['review', 'low', 'high', 'xhigh', 'max', 'simple', 'sol', 'luna', 'astra', 'fast', 'no-fast', 'subagents', 'bulk', 'expect-changes']:
        p.add_argument('--' + option, action='store_true')
    for option in ['why', 'goal', 'body', 'budget', 'forbid', 'pitfalls', 'report', 'after', 'environment', 'question']:
        p.add_argument('--' + option)
    p.add_argument('--override-order', metavar='理由', help='调遣令把目标执行者设为停用时强行放行；理由写进 brief 偏差和账本')
    p.add_argument('--level', type=level_arg, help='难度档 L1–L4，记入账本')
    p.add_argument('--type', type=str.lower, help='任务类型，记入账本：work|review|research|copy|media|orchestrate|judge|ops 等')
    p.add_argument('--for', dest='for_name', help='本单复核的任务名，记入账本做 maker/checker 配对')
    p.add_argument('--deliverables', action='append', help='交付物及篇幅上限，可多次指定')
    p.add_argument('--action', dest='task_action', help='动作，多项用 / 分隔：只读、改代码、本地提交、推送、部署、付费')
    p.add_argument('--auth')
    p.add_argument('--scene', help='项目场景，逗号分隔；none 跳过自动匹配')
    p.add_argument('--project', help='场景所属项目根目录')
    p.add_argument('--no-lint', action='store_true', help='仅豁免样板 lint，仍检查入口与授权')
    p.add_argument('--worktree', nargs='?', const='')
    p.add_argument('--workspace', choices=['gcp', 'local'], help='工作区位置；实验开关开启时编码单默认 gcp，否则默认 local')
    for option in ['write', 'read']:
        p.add_argument('--' + option, nargs='+', action='extend')
    group = p.add_mutually_exclusive_group()
    group.add_argument('--dry-run', action='store_true')
    group.add_argument('--no-launch', action='store_true')
    for action, help_text in [('scenes', '列出项目派单场景'), ('context', '输出两层派单上下文'),
                              ('doctor', '检查两层规则和安装状态')]:
        sub.add_parser(action, help=help_text).add_argument('--project', default='.')
    p = sub.add_parser('batch', help='JSON 数组，每项为 new 的参数数组；先打印重叠矩阵')
    p.add_argument('manifest')
    p.add_argument('--dry-run', action='store_true')
    p = sub.add_parser('amend')
    p.add_argument('--quiet', action='store_true')
    p.add_argument('--local-reason')
    p.add_argument('name')
    p.add_argument('message')
    p.add_argument('--on', choices=['mini', 'local'])
    p.add_argument('--auth', help='替换授权块，逗号分隔')
    p.add_argument('--action', dest='task_action', help='替换动作行')
    p.add_argument('--astra', action='store_true', help='GPT 任务改用 Astra')
    p.add_argument('--sol', action='store_true', help='后续重派使用 Sol')
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
    p.add_argument('--quiet', action='store_true')
    p.add_argument('name')
    p.add_argument('--keep-brief', action='store_true', help='沿用已拼装 brief，跳过正文文件更新')
    p.add_argument('--worktree', nargs='?', const='')
    p.add_argument('--override-order', metavar='理由', help='调遣令把目标执行者设为停用时强行放行；理由写进 brief 偏差和账本')
    p.add_argument('--after', help='在指定任务结束后运行')
    p.add_argument('--on', choices=['mini', 'local'])
    p.add_argument('--local-reason')
    p.add_argument('--pull', action='store_true')
    p.add_argument('--to', choices=PRODUCTS)
    p.add_argument('--tier', choices=['haiku', 'sonnet', 'opus', 'fable'])
    p.add_argument('--astra', action='store_true', help='GPT 任务改用 Astra')
    p.add_argument('--sol', action='store_true', help='GPT 任务改用 Sol')
    p.add_argument('--simple', action='store_true', help='GPT 任务改用 Terra，默认不开 fast')
    p.add_argument('--luna', action='store_true', help='GPT 任务改用 Luna，默认 xhigh 且不开 fast')
    p.add_argument('--low', action='store_true', help='GPT/Gemini 任务使用 low 推理')
    p.add_argument('--high', action='store_true', help='GPT/Gemini 任务使用 high 推理')
    p.add_argument('--xhigh', action='store_true', help='Luna/Gemini 使用 xhigh 推理（Gemini 默认 xhigh）')
    p.add_argument('--max', action='store_true', help='Luna 使用 max 推理')
    p.add_argument('--fast', action='store_true', help='GPT 任务开启 fast')
    p.add_argument('--no-fast', action='store_true', help='兼容旧用法，无副作用')
    p = sub.add_parser('clean', help='按修改时间直接删除旧日志、报告与已合并 worktree（本机与 Mini）')
    p.add_argument('--older-than', default='7d')
    p.add_argument('--json', action='store_true', help='输出逐文件明细JSON；默认只输出摘要与聚合待确认清单')
    p.add_argument('--include-backups', nargs='+', default=[], metavar='PATH', help='用户逐项同意后，显式指定待确认的证据/备份路径')
    p.add_argument('--dry-run', action='store_true')
    p = sub.add_parser('worktree')
    p.add_argument('operation', choices=['prune', 'recreate'])
    p.add_argument('--base', help='手工 worktree 的原环境分支，如 origin/main')
    p.add_argument('name')
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
    p.add_argument('--project', help='brief 所属项目根目录')
    p.add_argument('brief')
    p.add_argument('--no-lint', action='store_true', help='仅豁免样板 lint，仍检查入口与授权')
    p.add_argument('--simple', action='store_true')
    p.add_argument('--sol', action='store_true')
    p.add_argument('--on', choices=['mini', 'local'], default=None)
    p.add_argument('--to', choices=PRODUCTS, default='gpt')
    order.add_parser(sub)
    sub.add_parser('team')
    sub.add_parser('patrol', help='汇总在途任务实况')
    p = sub.add_parser('status')
    p.add_argument('--all', action='store_true')
    p = sub.add_parser('score')
    p.add_argument('--fault-window', action='store_true', help='输出判定和派单的七项指标')
    p.add_argument('--until', help='只统计该日期（YYYY-MM-DD）及以前的账本行')
    p.add_argument('--since', help='只统计该日期（YYYY-MM-DD）及以后的账本行')
    return parser


def main():
    secrets = list(secret_findings('\n'.join(sys.argv[1:])))
    if secrets:
        raise ValueError('\n'.join(secrets))
    parser = build_parser()
    if any(a == '--kind' or a.startswith('--kind=') for a in sys.argv[1:]):
        raise ValueError('请使用 --to gpt|openai|claude|grok|gemini|jev。')
    args = parser.parse_args()
    try:
        if getattr(args, 'quiet', False): os.environ['FLEET_WAIT_QUIET'] = '1'
        if args.action in ('new', 'amend', 'relaunch') and getattr(args, 'on', None) == 'mini' and mini.on_mini():
            hint = fix_hint(
                lambda argv: replace_option(replace_option(argv, '--on', 'local'), '--local-reason', '已在Mini本机运行')
                if not any(t == '--local-reason' or t.startswith('--local-reason=') for t in argv)
                else replace_option(argv, '--on', 'local'),
            )
            raise ValueError('已在 Mini 上；请使用 --on local --local-reason <理由> 或在派单机执行 --on mini。' + hint)
        if args.action in ('new', 'relaunch'):
            resolve_on_mini_location(args)
            args._mini_resolved = True
            if args.action == 'new' and args.on is None:
                args.on = os.environ.get('FLEET_DEFAULT_ON', 'mini')
        elif args.action == 'lint' and args.on is None:
            args.on = 'local' if mini.on_mini() else os.environ.get('FLEET_DEFAULT_ON', 'mini')
        if hasattr(args, 'name') and not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]*', args.name) and not (args.action in ('relaunch', 'amend', 'worktree') and args.name.endswith('.brief.md')):
            raise ValueError('名称只能包含字母、数字、下划线与连字符。')
    except ValueError as error:
        if args.action == 'new' and args.dry_run:
            record_rejection(str(uuid.uuid4()), 'lint', 'input', getattr(args, 'name', ''), error, True)
        raise
    if args.action == 'new':
        try:
            new(args)
        except (ValueError, OSError, subprocess.SubprocessError) as error:
            if not args.gate_stage:
                record_rejection(args.attempt_id, 'lint', 'input', args.name, error, args.dry_run)
            raise
    elif args.action == 'context':
        context(project_root(args.project))
    elif args.action == 'doctor':
        doctor(project_root(args.project))
    elif args.action == 'scenes':
        for name, (data, _) in dispatch_scenes(project_root(args.project)).items():
            print(f"{name}\t{data['description']}")
    elif args.action == 'batch':
        batch(args, parser)
    elif args.action == 'amend':
        amend(args)
    elif args.action == 'relaunch':
        relaunch(args.name, args.to, args.tier, args.simple, args.fast, args.no_fast, args.luna, args.high, args.xhigh, args.max, args.low, args.on, args.pull, args.sol, args.after, args.worktree, args.override_order, args.local_reason, args.astra, args.keep_brief)
    elif args.action == 'order':
        order.main(args)
    elif args.action == 'clean':
        clean.command(args)
    elif args.action == 'worktree':
        path, meta = locate(args.name)
        args.name = meta.get('name') or path.name[:-len('.brief.md')]
        if any(r.get('name') == args.name and r.get('status') in ('running', 'queued', 'parked', 'waiting', 'unreachable') for r in running(False, name=args.name)):
            raise ValueError('任务仍在运行。')
        if args.operation == 'prune':
            if not meta.get('worktree'):
                raise ValueError('任务没有登记 worktree。')
            worktree_call({**meta['worktree'], 'action': 'prune'}, meta.get('worktree_location', 'local'))
            print('已删除 worktree；保留重建记录。')
        else:
            old, location = recorded_worktree(meta)
            if not old:
                raise ValueError('任务没有唯一的已登记 worktree 路径。')
            base = args.base or old.get('base')
            if not base:
                raise ValueError('手工 worktree 未登记基线；请提供 --base <原环境分支>。')
            created = worktree_call({**old, 'action': 'recreate', 'base': base}, location)
            original = path.read_text()
            text = original.replace('；分支：' + old['branch'] + '；', '；分支：' + created['branch'] + '；', 1)
            text = text.replace('branch -D ' + shlex.quote(old['branch']) + '`',
                                'branch -D ' + shlex.quote(created['branch']) + '`', 1)
            if text != original:
                path.write_text(text)
            meta.update(worktree=created, worktree_location=location)
            path.with_suffix('.json').write_text(json.dumps(meta, ensure_ascii=False) + '\n')
            print(f"已重建 worktree：{created['path']}（{created['branch']}）")
    elif args.action == 'read':
        rec = mini.find(args.name)
        if not rec or rec.get('local'):
            if args.log or args.result or args.pull:
                raise ValueError('找不到 Mini 任务，无法读取日志、结果或拉回文件。')
            name = (rec.get('name') if rec else None) or args.name
            briefs = report_matches(name + '.brief.md')
            reports = report_matches(name + '.md')
            if briefs:
                _, meta = locate(name)
                path = Path(meta['report'])
            elif len(reports) == 1:
                path = reports[0]
            else:
                raise ValueError('找不到唯一的本机报告；请检查报告目录。')
            content = path.read_text()
            print(''.join(content.splitlines(keepends=True)[:args.head]), end='')
            return
        sys.exit(mini.read(rec, 'log' if args.log else 'result' if args.result else 'report', args.head, args.pull))
    elif args.action in ('say', 'stop'):
        os.execvp('fleet', ['fleet', args.action, args.name] + ([args.message] if args.action == 'say' else []))
    elif args.action == 'patrol':
        os.execvp('node', ['node', str(Path(__file__).with_name('patrol.mjs'))])
    elif args.action == 'team':
        os.execvp('fleet', ['fleet', 'team'])
    elif args.action == 'lint':
        brief_path = Path(args.brief)
        original = brief_path.read_text()
        secrets = list(secret_findings(original))
        if secrets:
            raise ValueError('\n'.join(secrets))
        normalized = normalize_brief(original, args.to, str(brief_path.resolve().with_suffix('.report.md')))
        checked(normalized, args.to, args.to == 'gpt' and not args.sol, args.on, True, args.sol, args.no_lint, args.project)
        if normalized != original:
            brief_path.write_text(normalized)
        print('lint 通过。')
    elif args.action == 'score':
        score(args)
    else:
        rows = running(False, status_timeout=float(os.environ.get('FLEET_MINI_STATUS_TIMEOUT', '10')), recent_seconds=None if args.all else 3600)
        # fleet status 只返回最近 24 小时；补入本地已结束的历史记录。
        folder = Path(os.environ.get('AGENT_FLEET_RUNS_DIR', Path.home() / '.agent-fleet/runs'))
        known = {r['runId'] for r in rows}
        for path in sorted(folder.glob('*.json'), key=lambda p: p.name.endswith('.pid.json')):
            try:
                rec = json.loads(path.read_text())
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
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
            if rec.get('runId') and rec.get('runId') not in known and rec.get('status') in ('done', 'failed', 'stopped', 'blocked'):
                rows.append(rec)
                known.add(rec['runId'])
        if not args.all:
            cutoff = datetime.datetime.now(datetime.timezone.utc).timestamp() - 3600
            selected = []
            for r in rows:
                stamp = r.get('finishedAt') or r.get('startedAt')
                recent = stamp and datetime.datetime.fromisoformat(stamp.replace('Z', '+00:00')).timestamp() >= cutoff
                if r.get('state', r.get('status')) not in ('done', 'failed', 'stopped', 'blocked') or recent:
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
        if sys.argv[1:2] == ['new'] and '--dry-run' in sys.argv and not preview_recorded:
            record_rejection(str(uuid.uuid4()), 'lint', 'input', '', error, True)
        # 不回显正文、命令参数或状态内容，避免错误输出带出秘密。
        if isinstance(error, ValueError):
            message = str(error)
        elif isinstance(error, OSError):
            message = f'路径/子命令 {error.filename if error.filename in ("fleet", "pgrep") else diagnostic_path(error.filename) if error.filename else "未知"}：{errno.errorcode.get(error.errno, "OSError")}。'
        else:
            cmd = getattr(error, 'cmd', None)
            executable = Path(cmd[0]).name if isinstance(cmd, (list, tuple)) and cmd else '未知'
            message = f'子命令 {executable}：{type(error).__name__} exit={getattr(error, "returncode", "未知")}。'
        retry = retry_command()
        if retry and '修改后重跑：' not in message and '可复制修正命令：' not in message:
            message += '\n修改后重跑：' + retry
        print('错误：' + message, file=sys.stderr)
        sys.exit(1)
