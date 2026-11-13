"""Mac Mini transport for detached fleet runs."""
from contextlib import contextmanager
import base64
import json
import os
import re
from pathlib import Path
import shlex
import signal
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
# 非交互 ssh 的 PATH 不含 Homebrew；远端脚本一律补上，避免把“PATH 没带上”误判成“Mini 没装”。
PATH_FIX = "import os as _os; _os.environ['PATH']=':'.join(dict.fromkeys([*_os.environ.get('PATH','').split(':'),'/opt/homebrew/bin','/usr/local/bin']))\n"
TOOLS_MISSING = 'Mini 缺命令：'
# brief 正文出现这些命令即视为需要；其余命令写在「需要命令: a, b」行。
KNOWN_TOOLS = ('kubectl', 'aws', 'gh', 'psql', 'coscli', 'rclone', 'helm', 'terraform')

def required_commands(text):
    names = []
    for line in text.splitlines():
        explicit = re.match(r'^[ \t]*需要命令[ \t]*[:：](.*)$', line)
        if explicit:
            names.extend(x.strip('` ') for x in re.split(r'[,，、/\s]+', explicit.group(1)) if x.strip('` '))
        elif not re.search(r'禁止|不要|不用|不得|不准|别用', line):
            names.extend(t for t in KNOWN_TOOLS if re.search(r'(?<![\w./-])' + t + r'(?![\w-])', line))
    return list(dict.fromkeys(names))

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

def call(script, payload, timeout=30, kill_group=False):
    data = base64.b64encode(json.dumps(payload, ensure_ascii=False).encode()).decode()
    cmd = 'python3 -c ' + shlex.quote(script) + ' ' + shlex.quote(data)
    if not kill_group:
        return subprocess.run([MM, cmd], capture_output=True, text=True, timeout=timeout)
    proc = subprocess.Popen([MM, cmd], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        stdout, stderr = proc.communicate(timeout=timeout)
    except subprocess.TimeoutExpired:
        try: os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError: pass
        proc.stdout.close()
        proc.stderr.close()
        proc.wait()
        raise
    return subprocess.CompletedProcess(proc.args, proc.returncode, stdout, stderr)

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

def sync_reports(meta, paths):
    """把本机 ~/.agent-reports 下的输入同步到 Mini：缺的补齐；已有文件本机较新且内容不同就覆盖。"""
    root = Path(LOCAL_HOME) / '.agent-reports'
    writes = {expand_path(p) for p in [*meta.get('writes', []), *(meta.get('object') or {}).get('writes', [])]}
    targets = []
    for value in dict.fromkeys(paths):
        path = Path(expand_path(value))
        if not path.is_relative_to(root): continue
        if not path.exists():
            if str(path) not in writes: continue
            path.mkdir(parents=True, exist_ok=True)
        targets.append(path)
    if not targets: return []
    stat = """import base64,json,pathlib,sys
p=json.loads(base64.b64decode(sys.argv[1])); out=[]
for x in p:
 f=pathlib.Path(x); out.append(None if not f.exists() else ('dir' if f.is_dir() else f.stat().st_mtime))
print(json.dumps(out))
"""
    result = call(stat, [remote_path(str(p)) for p in targets])
    if result.returncode: raise OSError('传输失败')
    states = json.loads(result.stdout)
    push = """import base64,json,os,pathlib,sys
p=json.loads(base64.b64decode(sys.argv[1])); path=pathlib.Path(p['path'])
if p['data'] is None: path.mkdir(parents=True,exist_ok=True)
else:
 path.parent.mkdir(parents=True,exist_ok=True); data=base64.b64decode(p['data'])
 if p['mode']=='create':
  try:
   with path.open('xb') as f: f.write(data)
  except FileExistsError: sys.exit(0)
 elif path.exists() and path.read_bytes()==data: sys.exit(0)
 else:
  tmp=path.with_name(path.name+'.fleet-sync'); tmp.write_bytes(data); os.replace(tmp,path)
 os.utime(path,(p['mtime'],p['mtime'])); print('written')
"""
    synced = []
    for path, state in zip(targets, states):
        if state is None:
            mode, items = 'create', ([path, *path.rglob('*')] if path.is_dir() else [path])
        elif state != 'dir' and path.is_file() and path.stat().st_mtime > state + 1:
            mode, items = 'overwrite', [path]
        else:
            continue
        for item in items:
            if item.is_symlink(): raise OSError('报告路径包含符号链接')
            data = None if item.is_dir() else base64.b64encode(item.read_bytes()).decode()
            result = call(push, {'path': remote_path(str(item)), 'data': data, 'mode': mode, 'mtime': item.stat().st_mtime})
            if result.returncode: raise OSError('传输失败')
            if result.stdout.strip() == 'written': synced.append(str(item) + ('（覆盖）' if mode == 'overwrite' else ''))
    return synced

def preflight(meta, paths):
    if not REMOTE_HOME or not REMOTE_BIN: return 'Mini 路径未配置（FLEET_MINI_HOME、FLEET_MINI_BIN）'
    script = PATH_FIX + """import base64,json,os,pathlib,shutil,subprocess,sys
p=json.loads(base64.b64decode(sys.argv[1]))
""" + CANONICAL_SCRIPT + """
p['paths']=[canonical(x) for x in p['paths']]; missing=[x for x in p['paths'] if not pathlib.Path(x).exists()]; tools=[t for t in p.get('commands',[]) if not shutil.which(t)]
kind=p['kind']; binary=pathlib.Path(p['bin']); root=binary.parent if binary.is_dir() else binary.parent.parent; envnames={'claude':'ANTHROPIC_CREDIT_API_KEY','openai':'OPENAI_CREDIT_API_KEY','gemini':'KOLLAB_PROD_API_KEY','jev':'TYPESAFE_API_KEY'}
if kind in envnames:
 js="import {loadEnvFile} from './src/env.mjs'; loadEnvFile('.env'); process.exit(process.env[process.argv[1]] ? 0 : 1)"
 r=subprocess.run(['node','--input-type=module','-e',js,envnames[kind]],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=10); ready=r.returncode==0
elif kind in ('gpt','grok'):
 cmd=['codex','login','status'] if kind=='gpt' else ['grok','models']
 try: ready=subprocess.run(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=20).returncode==0
 except (OSError,subprocess.TimeoutExpired): ready=False
else: ready=False
print(json.dumps({'missing':missing,'ready':ready,'tools':tools}))
"""
    report = os.path.normpath(meta['report']) if meta.get('report') else None
    checkpoint = os.path.splitext(report)[0] + '.checkpoint.md' if report else None
    temp = os.path.normpath('/tmp/' + meta['name']) if meta.get('name') else None
    def is_input(path):
        path = os.path.normpath(expand_path(path))
        return path not in (report, checkpoint, temp) and not (temp and path.startswith(temp + os.sep))
    inputs = [p for p in paths if is_input(p)]
    try:
        text = Path(meta['brief']).read_text() if meta.get('brief') and Path(meta['brief']).is_file() else ''
    except OSError:
        text = ''
    payload = {'paths': [remote_path(expand_path(p)) for p in inputs], 'kind': meta['to'], 'bin': REMOTE_BIN, 'home': REMOTE_HOME, 'commands': required_commands(text)}
    try:
        try:
            synced = sync_reports(meta, [*([meta['body']] if meta.get('body') else []), *inputs])
            if synced: print('Mini 已同步报告文件：' + '、'.join(synced), flush=True)
        except (OSError, subprocess.TimeoutExpired, ValueError):
            return 'Mini 报告同步失败'
        result = call(script, payload, timeout=25)
        if result.returncode: return 'Mini 环境检查失败'
        value = json.loads(result.stdout)
        reasons = []
        if value.get('tools'): reasons.append(TOOLS_MISSING + '、'.join(value['tools']) + '（已按登录 shell 补 /opt/homebrew/bin 仍找不到）')
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
    match = re.search(r'^\s*仓库\s*[:：]\s*(/[^\s`]+)', Path(meta['brief']).read_text(), re.M)
    repo = remote_path(match.group(1)) if match else ''
    payload = {'files': files, 'args': args, 'cwd': remote_path(os.getcwd()), 'repo': repo, 'report': remote_path(meta['report']), 'home': REMOTE_HOME}
    script = PATH_FIX + '''import base64,json,os,pathlib,subprocess,sys
p=json.loads(base64.b64decode(sys.argv[1]));
''' + CANONICAL_SCRIPT + '''
p['args']=[canonical(x) for x in p['args']]; p['cwd']=canonical(p['cwd']); p['repo']=canonical(p['repo']); p['report']=canonical(p['report'])
if not pathlib.Path(p['cwd']).is_dir():
 p['cwd']=p['repo'] if p['repo'] and pathlib.Path(p['repo']).is_dir() else p['home']
 print('Mini 工作目录不存在，改用：' + p['cwd'], flush=True)
p['files']={canonical(k):canonical(v) for k,v in p['files'].items()}
binary=pathlib.Path(p['args'][0]); p['args'][0]=str(binary/'fleet' if binary.is_dir() else binary)
for name,text in p['files'].items():
 f=pathlib.Path(name); f.parent.mkdir(parents=True,exist_ok=True); f.write_text(text)
pathlib.Path(p['report']).parent.mkdir(parents=True,exist_ok=True)
r=subprocess.run(p['args'],cwd=p['cwd'],env={**os.environ,'FLEET_MACHINE':'mini'},capture_output=True,text=True); print(r.stdout,end=''); print(r.stderr,end='',file=sys.stderr); sys.exit(r.returncode)
'''
    p = call(script, payload)
    if p.returncode: raise ValueError('Mini 启动失败；请检查 Mini 端任务状态，避免重复启动。\n' + ((p.stderr or '') + (p.stdout or ''))[-600:])
    if p.stdout.startswith('Mini 工作目录不存在'): print(p.stdout.splitlines()[0], flush=True)
    m = re.search(r'^runId: (\S+)', p.stdout, re.M)
    if not m: raise ValueError('Mini 启动回执缺少 runId；请先检查 Mini 端状态。')
    rec = {'id': m.group(1), 'name': meta['name'], 'report': meta['report'], 'brief': meta['brief']}
    STORE.mkdir(parents=True, exist_ok=True)
    (STORE / (rec['id'] + '.json')).write_text(json.dumps(rec, ensure_ascii=False) + '\n')
    print('Mini runId: ' + rec['id'], flush=True)
    return wait(rec, meta.get('pull', False))

STATUS_KEYS = ('runId', 'status', 'state', 'verdict', 'exitCode', 'resultPath', 'startedAt', 'finishedAt', 'model', 'duration', 'heartbeatAt', 'launchDetached')

def query(rec, timeout=20, kill_group=False):
    script = PATH_FIX + '''import base64,json,pathlib,subprocess,sys
p=json.loads(base64.b64decode(sys.argv[1])); binary=pathlib.Path(p['bin']); binary=binary/'fleet' if binary.is_dir() else binary; r=subprocess.run([str(binary),'status','--json'],capture_output=True,text=True,check=True); rows=json.loads(r.stdout); row=next((x for x in rows if x.get('runId')==p['id']),None)
if row is None: row=json.loads((pathlib.Path.home()/'.agent-fleet/runs'/(p['id']+'.json')).read_text())
print(json.dumps({k:row.get(k) for k in p['keys']}))
'''
    if kill_group:
        p = call(script, {**rec, 'bin': REMOTE_BIN, 'keys': STATUS_KEYS}, timeout=timeout, kill_group=True)
    else:
        p = call(script, {**rec, 'bin': REMOTE_BIN, 'keys': STATUS_KEYS}, timeout=timeout)
    if p.returncode: raise ConnectionError('Mini 状态暂不可读')
    return json.loads(p.stdout)

class StatusError(ConnectionError):
    """批量取 Mini 状态失败；reason 只写失败类别，不带远端输出。"""
    def __init__(self, reason):
        super().__init__(reason)
        self.reason = reason

def query_all(recs, since=None, timeout=20):
    """一次 ssh 取 recs 的 run 摘要（Mini 端只跑一次 fleet status，再补读 24 小时外的 run 文件）。

    since 是 epoch 秒：给定时 Mini 端丢弃更早结束的终态行，不传输。
    返回 (rows, missing)：rows 为 {runId: 摘要}，missing 是 Mini 上找不到记录的 runId。
    """
    script = PATH_FIX + '''import base64,datetime,json,pathlib,subprocess,sys
p=json.loads(base64.b64decode(sys.argv[1])); binary=pathlib.Path(p['bin']); binary=binary/'fleet' if binary.is_dir() else binary
try: live={x.get('runId'):x for x in json.loads(subprocess.run([str(binary),'status','--json'],capture_output=True,text=True,check=True).stdout)}
except Exception: sys.exit(3)
runs=pathlib.Path.home()/'.agent-fleet/runs'; rows={}; missing=[]
def stamp(row):
    try: return datetime.datetime.fromisoformat((row.get('finishedAt') or row.get('startedAt')).replace('Z','+00:00')).timestamp()
    except Exception: return None
for i in p['ids']:
    row=live.get(i)
    if row is None:
        try: row=json.loads((runs/(i+'.json')).read_text())
        except (OSError,ValueError): missing.append(i); continue
    if p['since'] is not None and row.get('status') in ('done','failed','stopped','blocked'):
        t=stamp(row)
        if t is not None and t<p['since']: continue
    rows[i]={k:row.get(k) for k in p['keys']}
print(json.dumps({'rows':rows,'missing':missing}))
'''
    payload = {'ids': [r['id'] for r in recs], 'bin': REMOTE_BIN, 'since': since, 'keys': STATUS_KEYS}
    try:
        p = call(script, payload, timeout=timeout, kill_group=True)
    except subprocess.TimeoutExpired:
        raise StatusError(f'超时（{timeout:.1f} 秒内无响应）')
    except OSError:
        raise StatusError('连接失败（本机 mm 命令不可用）')
    if p.returncode == 255 or (p.returncode == 1 and '不可达' in p.stderr):
        raise StatusError(f'连接失败（exit={p.returncode}）')
    if p.returncode == 3:
        raise StatusError('Mini 端 fleet status 失败')
    if p.returncode:
        raise StatusError(f'Mini 端取数失败（exit={p.returncode}）')
    try:
        data = json.loads(p.stdout)
        return data['rows'], data['missing']
    except (ValueError, KeyError, TypeError):
        raise StatusError('返回格式错误')

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

@contextmanager
def parent_slot_released():
    parent = os.environ.get('FLEET_SLOT_RUN_ID') or os.environ.get('FLEET_DETACHED_RUN_ID')
    if not parent:
        yield
        return
    lease = subprocess.Popen(['node', str(Path(__file__).with_name('queue.mjs')), '--wait-parent'],
                             stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True)
    try:
        if lease.stdout.readline().strip() != 'ready': raise ValueError('父单让槽失败')
        yield
    finally:
        lease.communicate()
        if lease.returncode: raise ValueError('父单恢复槽位失败')


def wait(rec, pull=False):
    with parent_slot_released():
        return _wait(rec, pull)


def record_quota_order(rec, row):
    """Mini 上的 run 失败结束：读 Mini 端日志/结果尾部和 Codex 用量记录，交给调遣令自动记账（规则见 order.py）。错误一律吞掉。"""
    try:
        if row.get('verdict') == 'ok' or row.get('status') == 'stopped': return
        result = row.get('resultPath') or ''
        script = PATH_FIX + '''import base64,json,pathlib,sys
p=json.loads(base64.b64decode(sys.argv[1]))
def tail(path,n):
    f=pathlib.Path(path) if path else None
    return f.read_text(errors='replace')[-n:] if f and f.is_file() else ''
quota=None
try: quota=json.loads((pathlib.Path.home()/'.agent-fleet/runs/codex-quota.json').read_text())
except Exception: pass
print(json.dumps({'text':tail(p['log'],6000)+'\\n'+tail(p['result'],3000),'codexQuota':quota}))
'''
        p = call(script, {'log': result.removesuffix('.result.md') + '.log' if result else '', 'result': result}, timeout=20)
        if p.returncode: return
        data = json.loads(p.stdout)
        import order
        order.auto_record({'runId': rec['id'], 'name': rec.get('name'), 'route': row.get('model'), 'finishedAt': row.get('finishedAt'),
                           'text': data.get('text', ''), 'codexQuota': data.get('codexQuota')})
    except Exception:
        pass

def _wait(rec, pull=False):
    while True:
        try:
            row = query(rec)
            if row.get('status') not in ('running', 'queued', 'parked', 'waiting', 'abnormal'): break
        except (ConnectionError, OSError, subprocess.TimeoutExpired, ValueError):
            print('Mini 连接中断，等待重连…', file=sys.stderr, flush=True)
        time.sleep(5)
    record_quota_order(rec, row)
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
    p = call(PATH_FIX + '''import base64,json,pathlib,subprocess,sys
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
