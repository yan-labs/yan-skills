"""Mac Mini transport for detached fleet runs."""
import base64
import json
import os
import re
from pathlib import Path
import shlex
import subprocess
import sys
import time

try:
    CONFIG = json.loads((Path.home() / '.agent-fleet/mini.json').read_text())
except (OSError, ValueError):
    CONFIG = {}

MM = os.environ.get('FLEET_MINI_MM', CONFIG.get('mm', str(Path.home() / '.claude/skills/macmini/scripts/mm')))
REMOTE_BIN = (os.environ.get('FLEET_MINI_BIN') or CONFIG.get('bin', ''))
LOCAL_HOME = os.environ.get('FLEET_LOCAL_HOME', CONFIG.get('local_home', str(Path.home()))).rstrip('/')
REMOTE_HOME = (os.environ.get('FLEET_MINI_HOME') or CONFIG.get('remote_home', '')).rstrip('/')
STORE = Path.home() / '.agent-fleet/mini-runs'

def map_path(value, source, target):
    if source and target and (value == source or value.startswith(source + '/')):
        return target + value[len(source):]
    return value

def remote_path(value):
    return map_path(value, LOCAL_HOME, REMOTE_HOME)

def local_path(value):
    return map_path(value, REMOTE_HOME, LOCAL_HOME)

PATH_PATTERN = r"(?<![\w:/.$~-])(?:\$HOME/|~/|\.\.?/|/)(?:\[[^\]\s「」『』（）【】，。、；：！？“”‘’]+\]|[^\s\"'`<>「」『』（）【】，。、；：！？“”‘’(),;:\[\]{}])+"

def expand_path(value):
    return os.path.abspath(os.path.expanduser(os.path.expandvars(value)))

def rewrite_brief(text):
    return re.sub(re.escape(LOCAL_HOME) + r'(?![\w-])', lambda m: REMOTE_HOME, text) if LOCAL_HOME and REMOTE_HOME else text

def available():
    try:
        p = subprocess.run([MM, '--method'], capture_output=True, text=True, timeout=5)
        return p.returncode == 0 and p.stdout.strip() in ('direct', 'tailscale')
    except (OSError, subprocess.TimeoutExpired):
        return False

def call(script, payload, timeout=30):
    data = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode()).decode()
    cmd = 'python3 -c ' + shlex.quote(script) + ' ' + shlex.quote(data)
    return subprocess.run([MM, cmd], capture_output=True, text=True, timeout=timeout)

def records():
    if not STORE.exists(): return []
    return [json.loads(p.read_text()) for p in STORE.glob('*.json')]

def find(spec):
    remote = records()
    local_dir = Path(os.environ.get('AGENT_FLEET_RUNS_DIR', Path.home() / '.agent-fleet/runs'))
    local = []
    if local_dir.exists():
        for path in local_dir.glob('*.json'):
            if path.name.endswith(('.pid.json', '.queue.json')): continue
            try:
                row = json.loads(path.read_text())
                if row.get('runId'):
                    local.append({'id': row['runId'], 'name': row.get('name'), 'startedAt': row.get('startedAt', ''), 'local': True})
            except (OSError, ValueError): pass
    rows = remote + local
    exact = [r for r in rows if r['id'] == spec]
    if exact: return exact[0]
    names = [r for r in rows if r.get('name') == spec]
    if names:
        def timestamp(row):
            if row.get('startedAt'): return row['startedAt']
            match = re.match(r'(\d{4}-\d{2}-\d{2}T\d{2})-(\d{2})-(\d{2})-(\d{3})Z', row['id'])
            return f'{match[1]}:{match[2]}:{match[3]}.{match[4]}Z' if match else ''
        return max(names, key=timestamp)
    rows = [r for r in rows if r['id'].startswith(spec) or (spec.startswith('detach-') and r['id'].endswith(spec))]
    if len(rows) == 1: return rows[0]
    if len(rows) > 1: raise ValueError('任务匹配不唯一，请使用完整 runId。')
    return None


def referenced_paths(text):
    paths = []
    # Only filesystem roots, never relative paths or routes such as /api/foo.
    roots = (LOCAL_HOME, '/Users', '/Volumes', '/tmp', '/private', '/home')
    for match in re.finditer(PATH_PATTERN, text):
        token = match.group(0).rstrip('.。')
        if not (token.startswith('~/') or token.startswith('$HOME/') or any(token == root or token.startswith(root + '/') for root in roots if root)):
            continue
        path = expand_path(token)
        if any(c in path for c in '*?['):
            path = os.path.dirname(path[:min(path.index(c) for c in '*?[' if c in path)])
        paths.append(path)
    return list(dict.fromkeys(paths))

def preflight(meta, paths):
    if not REMOTE_HOME or not REMOTE_BIN: return 'Mini 路径未配置（FLEET_MINI_HOME、FLEET_MINI_BIN）'
    script = """import base64,json,os,pathlib,subprocess,sys
p=json.loads(base64.b64decode(sys.argv[1]))
""" + CANONICAL_SCRIPT + """
p['paths']=[canonical(x) for x in p['paths']]; missing=[x for x in p['paths'] if not pathlib.Path(x).exists()]
kind=p['kind']; binary=pathlib.Path(p['bin']); root=binary.parent if binary.is_dir() else binary.parent.parent; envnames={'claude':'ANTHROPIC_CREDIT_API_KEY','openai':'OPENAI_CREDIT_API_KEY','gemini':'KOLLAB_PROD_API_KEY','jev':'TYPESAFE_API_KEY'}
if kind in envnames:
 js="import {loadEnvFile} from './src/env.mjs'; loadEnvFile('.env'); process.exit(process.env[process.argv[1]] ? 0 : 1)"
 r=subprocess.run(['node','--input-type=module','-e',js,envnames[kind]],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10); ready=r.returncode==0
 if kind=='claude' and ready:
  try: ready=subprocess.run(['claude','auth','status'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10).returncode==0
  except (OSError,subprocess.TimeoutExpired): ready=False
elif kind in ('gpt','grok'):
 cmd=['codex','login','status'] if kind=='gpt' else ['grok','models']
 try: ready=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20).returncode==0
 except (OSError,subprocess.TimeoutExpired): ready=False
else: ready=False
print(json.dumps({'missing':missing,'ready':ready}))
"""
    report = os.path.normpath(meta['report']) if meta.get('report') else None
    checkpoint = os.path.splitext(report)[0] + '.checkpoint.md' if report else None
    temp = os.path.normpath('/tmp/' + meta['name']) if meta.get('name') else None
    def is_input(path):
        path = os.path.normpath(expand_path(path))
        return path not in (report, checkpoint, temp) and not (temp and path.startswith(temp + os.sep))
    payload = {'paths': [remote_path(expand_path(p)) for p in [os.getcwd(), *paths] if is_input(p)], 'kind': meta['to'], 'bin': REMOTE_BIN, 'home': REMOTE_HOME}
    try:
        result = call(script, payload, timeout=25)
        if result.returncode: return 'Mini 环境检查失败'
        value = json.loads(result.stdout)
        reasons = []
        if value['missing']: reasons.append('Mini 缺少路径：' + '、'.join(local_path(x) for x in value['missing']))
        if not value['ready']: reasons.append('Mini 的 ' + meta['to'] + ' 通道不可用')
        return '；'.join(reasons) if reasons else None
    except (OSError, subprocess.TimeoutExpired, ValueError, KeyError):
        return 'Mini 环境检查失败'

CANONICAL_SCRIPT = '''
import re
home=pathlib.Path(p['home']); names=[x.name for x in home.iterdir() if x.name.lower()=='project'] if home.is_dir() else []
if len(names)==1:
 pattern=re.compile(re.escape(str(home)) + r'/project(?![\\w-])',re.I)
 def canonical(value): return pattern.sub(lambda _: str(home / names[0]),value)
else:
 def canonical(value): return value
'''

def launch(meta, argv):
    files = {remote_path(meta['brief']): rewrite_brief(Path(meta['brief']).read_text())}
    if meta.get('questions'):
        files[remote_path(meta['questions'])] = Path(meta['questions']).read_text()
    metadata = Path(meta['brief']).with_suffix('.json')
    if metadata.exists():
        files[remote_path(str(metadata))] = rewrite_brief(metadata.read_text())
    args = list(argv)
    for i, value in enumerate(args):
        if i == 2 or (i and args[i-1] in ('--report', '--read', '--write', '--cwd')):
            args[i] = remote_path(expand_path(value))
    args[0] = REMOTE_BIN
    args.append('--no-wait')
    payload = {'files': files, 'args': args, 'cwd': remote_path(os.getcwd()), 'report': remote_path(meta['report']), 'home': REMOTE_HOME}
    script = '''import base64,json,os,pathlib,subprocess,sys
p=json.loads(base64.b64decode(sys.argv[1]));
''' + CANONICAL_SCRIPT + '''
p['args']=[canonical(x) for x in p['args']]; p['cwd']=canonical(p['cwd']); p['report']=canonical(p['report'])
p['files']={canonical(k):canonical(v) for k,v in p['files'].items()}
binary=pathlib.Path(p['args'][0]); p['args'][0]=str(binary/'fleet' if binary.is_dir() else binary)
for name,text in p['files'].items():
 f=pathlib.Path(name); f.parent.mkdir(parents=True,exist_ok=True); f.write_text(text)
pathlib.Path(p['report']).parent.mkdir(parents=True,exist_ok=True)
r=subprocess.run(p['args'],cwd=p['cwd'],env={**os.environ,'FLEET_MACHINE':'mini'},capture_output=True,text=True); print(r.stdout,end=''); print(r.stderr,end='',file=sys.stderr); sys.exit(r.returncode)
'''
    p = call(script, payload)
    if p.returncode: raise ValueError('Mini 启动失败；请检查 Mini 端任务状态，避免重复启动。\n' + ((p.stderr or '') + (p.stdout or ''))[-600:])
    import re
    m = re.search(r'^runId: (\S+)', p.stdout, re.M)
    if not m: raise ValueError('Mini 启动回执缺少 runId；请先检查 Mini 端状态。')
    rec = {'id': m.group(1), 'name': meta['name'], 'report': meta['report'], 'brief': meta['brief']}
    STORE.mkdir(parents=True, exist_ok=True)
    (STORE / (rec['id'] + '.json')).write_text(json.dumps(rec, ensure_ascii=False) + '\n')
    print('Mini runId: ' + rec['id'], flush=True)
    return wait(rec, meta.get('pull', False))

def query(rec):
    script = '''import base64,json,pathlib,subprocess,sys
p=json.loads(base64.b64decode(sys.argv[1])); binary=pathlib.Path(p['bin']); binary=binary/'fleet' if binary.is_dir() else binary; r=subprocess.run([str(binary),'status','--json'],capture_output=True,text=True,check=True); rows=json.loads(r.stdout); row=next((x for x in rows if x.get('runId')==p['id']),None)
if row is None: row=json.loads((pathlib.Path.home()/'.agent-fleet/runs'/(p['id']+'.json')).read_text())
print(json.dumps({k:row.get(k) for k in ('runId','status','state','verdict','exitCode','resultPath','startedAt','finishedAt','model','duration','heartbeatAt','launchDetached')}))
'''
    p = call(script, {**rec, 'bin': REMOTE_BIN}, timeout=20)
    if p.returncode: raise ConnectionError('Mini 状态暂不可读')
    return json.loads(p.stdout)

def read(rec, kind='report', head=None, pull=False, row=None):
    row = row or query(rec)
    paths = {'report': remote_path(rec['report']), 'result': row.get('resultPath'),
             'log': (row.get('resultPath') or '').removesuffix('.result.md') + '.log'}
    path = paths[kind]
    script = """import base64,json,pathlib,sys
p=json.loads(base64.b64decode(sys.argv[1])); f=pathlib.Path(p['path']); data=f.read_bytes() if f.is_file() else None
print(json.dumps(base64.b64encode(data).decode() if data is not None else None))
"""
    if not path: print('Mini 文件路径不可用', file=sys.stderr); return 1
    p = call(script, {'path': path}, timeout=20)
    if p.returncode: raise ConnectionError('Mini 文件暂不可读')
    data = json.loads(p.stdout)
    if data is None: print('Mini 文件不存在：' + path, file=sys.stderr); return 1
    content = base64.b64decode(data).decode()
    if pull:
        dest = Path(rec['report']) if kind == 'report' else Path.home()/'.agent-fleet/runs'/(rec['id'] + ('.result.md' if kind == 'result' else '.log'))
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(content)
        print('已拉回：' + str(dest))
    else:
        print(''.join(content.splitlines(keepends=True)[:head]) if head is not None else content, end='')
    return 0

def wait(rec, pull=False):
    while True:
        try:
            row = query(rec)
            if row.get('status') not in ('running', 'queued', 'parked', 'abnormal'): break
        except (ConnectionError, OSError, subprocess.TimeoutExpired, ValueError):
            print('Mini 连接中断，等待重连…', file=sys.stderr, flush=True)
        time.sleep(5)
    while True:
        try:
            result = row.get('resultPath') or ''
            log = result.removesuffix('.result.md') + '.log' if result else ''
            print('verdict: ' + str(row.get('verdict')))
            if result: read(rec, 'result', head=3, row=row)
            print('Mini REPORT: ' + remote_path(rec['report']))
            print('Mini result: ' + result)
            print('Mini log: ' + log)
            if pull or os.environ.get('FLEET_PULL_REPORTS') == '1':
                report_error = read(rec, 'report', pull=True, row=row)
                result_error = read(rec, 'result', pull=True, row=row)
                if report_error or result_error: return row.get('exitCode') or 1
            return 0 if row.get('verdict') == 'ok' else (row.get('exitCode') or 1)
        except (ConnectionError, OSError, subprocess.TimeoutExpired):
            print('Mini 连接中断，等待重连…', file=sys.stderr, flush=True); time.sleep(5)

def forward(args):
    p = call('''import base64,json,pathlib,subprocess,sys
p=json.loads(base64.b64decode(sys.argv[1])); binary=pathlib.Path(p[0]); p[0]=str(binary/'fleet' if binary.is_dir() else binary); r=subprocess.run(p, text=True); sys.exit(r.returncode)
''', [REMOTE_BIN, *args], timeout=90)
    sys.stdout.write(p.stdout); sys.stderr.write(p.stderr)
    return p.returncode

if __name__ == '__main__':
    rec = find(sys.argv[2]) if len(sys.argv) > 2 else None
    if not rec: sys.exit(2)
    if sys.argv[1] == 'local-id':
        if rec.get('local'): print(rec['id'])
        sys.exit(0)
    if rec.get('local'): sys.exit(2)
    if sys.argv[1] == 'has': sys.exit(0)
    if sys.argv[1] == 'wait': sys.exit(wait(rec, '--pull' in sys.argv[3:]))
    sys.exit(forward([sys.argv[1], rec['id'], *sys.argv[3:]]))
