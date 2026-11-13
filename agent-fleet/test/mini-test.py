import base64
import json
import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch
import io
from contextlib import redirect_stdout

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'src'))
import mini

# Empty environment overrides must not mask configured Mini paths.
with tempfile.TemporaryDirectory() as home:
    config = Path(home) / '.agent-fleet/mini.json'
    config.parent.mkdir()
    config.write_text(json.dumps({'remote_home': '/remote', 'bin': '/remote/fleet'}))
    env = dict(os.environ, HOME=home, FLEET_MINI_HOME='', FLEET_MINI_BIN='')
    result = subprocess.run([sys.executable, '-c', 'import mini; print(bool(mini.REMOTE_HOME), bool(mini.REMOTE_BIN))'], env={**env, 'PYTHONPATH': str(root / 'src')}, capture_output=True, text=True)
    assert result.stdout.strip() == 'True True'

mini.LOCAL_HOME = '/home/a'
mini.REMOTE_HOME = '/home/b'
mini.REMOTE_BIN = '/home/b/fleet'

assert mini.remote_path('/home/a/Project/x') == '/home/b/Project/x'
assert mini.remote_path('/home/a-archive') == '/home/a-archive'
assert mini.rewrite_brief('正文 /home/a/keep\n- 文本 /home/a/keep\n- /home/a/file\n') == '正文 /home/b/keep\n- 文本 /home/b/keep\n- /home/b/file\n'
assert not mini.referenced_paths('A/C P50/P95 fu/Bin Redis/DB Java/前端代码里找 private/input.txt')
assert mini.referenced_paths('~/.agent-reports/2026-11-0*/x.md') == [str(Path.home() / '.agent-reports')]
assert mini.referenced_paths('/tmp/report[0-9].md /tmp/report?.md /tmp/*/x.md') == ['/tmp']
assert mini.referenced_paths('--read private/input.txt --write ./out* --cwd ../project') == []
assert mini.rewrite_brief('REPORT: /home/a/r\n普通内容 /home/a-archive') == 'REPORT: /home/b/r\n普通内容 /home/a-archive'
assert mini.referenced_paths('./private/input $HOME/note') == [str(Path.home() / 'note')]
assert mini.local_path('/home/b/Project/x') == '/home/a/Project/x'
assert '/home/a/.agent-reports/rules-slim' in mini.referenced_paths('读取 /home/a/.agent-reports/rules-slim，或 ~/notes')
assert mini.referenced_paths('/home/a/kollab-chain-audit.md「缺陷 7」') == ['/home/a/kollab-chain-audit.md']
for punctuation in '「」『』（）【】，。、；：！？“”‘’\u3000':
    assert mini.referenced_paths('/home/a/file.md' + punctuation + '说明') == ['/home/a/file.md']
assert not mini.referenced_paths('https://example.com/a ../x /api/foo `/api/events`')
with patch.object(mini, 'call', return_value=subprocess.CompletedProcess([], 0, json.dumps({'missing':['/home/b/a'], 'ready':False}), '')):
    reason = mini.preflight({'to':'claude'}, ['/home/a/a'])
    assert 'Mini 缺少路径：/home/a/a' in reason and 'claude 通道不可用' in reason
with patch.object(mini, 'call', return_value=subprocess.CompletedProcess([], 0, json.dumps({'missing':[], 'ready':True}), '')) as remote:
    assert mini.preflight({'to':'gpt', 'name':'unit', 'report':'/tmp/report.md'}, ['/tmp/unit/', '/tmp/report.md', '/tmp/report.checkpoint.md', '/tmp/input']) is None
    assert remote.call_args.args[1]['paths'][-1:] == ['/tmp/input']

with tempfile.TemporaryDirectory() as d:
    root_fixture = Path(d)
    (root_fixture / 'src').mkdir()
    (root_fixture / 'src/env.mjs').write_text('export function loadEnvFile() {}')
    (root_fixture / 'bin').mkdir()
    (root_fixture / 'bin/claude').write_text('#!/bin/sh\nexit 1\n')
    (root_fixture / 'bin/claude').chmod(0o755)
    def run_preflight_script(script, payload, timeout=30):
        data = base64.b64encode(json.dumps(payload).encode()).decode()
        return subprocess.run([sys.executable, '-c', script, data], capture_output=True, text=True)
    with patch.object(mini, 'REMOTE_HOME', d), patch.object(mini, 'REMOTE_BIN', str(root_fixture / 'bin/fleet')), patch.object(mini, 'call', run_preflight_script), patch.dict(os.environ, {'ANTHROPIC_CREDIT_API_KEY': 'test-only', 'PATH': str(root_fixture / 'bin') + os.pathsep + os.environ['PATH']}):
        assert mini.preflight({'to':'claude'}, []) is None
    with patch.object(mini, 'REMOTE_HOME', d), patch.object(mini, 'REMOTE_BIN', str(root_fixture / 'bin/fleet')), patch.object(mini, 'call', run_preflight_script), patch.dict(os.environ, {'ANTHROPIC_CREDIT_API_KEY': ''}):
        assert 'claude 通道不可用' in mini.preflight({'to':'claude'}, [])

with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    brief = tmp / 'brief.md'; brief.write_text('REPORT: /home/a/a\n/read /home/a/b')
    meta = {'brief': str(brief), 'report': '/home/a/report.md', 'name': 'unit'}
    mini.STORE = tmp / 'records'
    got = {}
    def call(script, payload, timeout=30):
        got.update(payload)
        return subprocess.CompletedProcess([], 0, 'runId: run-123\n', '')
    with patch.object(mini, 'call', call), patch.object(mini, 'wait', return_value=0):
        assert mini.launch(meta, ['fleet','code',str(brief),'--report',meta['report']]) == 0
    assert got['args'] == [mini.REMOTE_BIN,'code',str(brief),'--report','/home/b/report.md','--no-wait']
    assert '/home/b/a' in got['files'][str(brief)]
    assert mini.find('run-123')['name'] == 'unit'
    local = tmp / 'local-runs'; local.mkdir()
    (local / 'local.json').write_text(json.dumps({'runId':'local-id','name':'unit','status':'done','startedAt':'2026-11-10T12:00:00.000Z'}))
    (mini.STORE / 'run-123.json').write_text(json.dumps({'id':'run-123','name':'unit','startedAt':'2026-11-10T11:00:00.000Z'}))
    with patch.dict(os.environ, {'AGENT_FLEET_RUNS_DIR':str(local)}):
        (local / 'local-id.queue.json').write_text(json.dumps({'runId':'local-id','name':'unit','state':'running','startedAt':12345}))
        assert mini.find('unit')['id'] == 'local-id'
        (local / 'local.json').write_text(json.dumps({'runId':'local-id','name':'unit','status':'running','startedAt':'2026-11-10T10:00:00.000Z'}))
        assert mini.find('unit')['id'] == 'run-123'
        assert mini.find('run-123')['id'] == 'run-123'
    # fleet-go read 只读取 Mini；最新同名记录在本机时不向 Mini 查询它。
    local_home = tmp / 'cli-home'
    mini_records = local_home / '.agent-fleet/mini-runs'; mini_records.mkdir(parents=True)
    (mini_records / 'old.json').write_text(json.dumps({'id':'2026-11-10T10-00-00-000Z-detach-old','name':'same','report':'/home/a/r'}))
    (local / 'same.json').write_text(json.dumps({'runId':'2026-11-10T12-00-00-000Z-detach-new','name':'same','startedAt':'2026-11-10T12:00:00.000Z'}))
    env = dict(os.environ, HOME=str(local_home), AGENT_FLEET_RUNS_DIR=str(local))
    result = subprocess.run([str(root/'bin/fleet-go'), 'read', 'same'], env=env, text=True, capture_output=True)
    assert result.returncode == 1 and '最新同名任务可能在本机' in result.stderr
    pulled = tmp/'pulled.md'
    row = {'status':'done', 'verdict':'ok', 'resultPath':'/home/b/.agent-fleet/runs/run-123.result.md'}
    data = base64.b64encode('/home/b/result\nsecond\nthird\n'.encode()).decode()
    with patch.object(mini, 'query', side_effect=[ConnectionError(), row]), patch.object(mini.time, 'sleep'), patch.object(mini, 'call', return_value=subprocess.CompletedProcess([],0,json.dumps(data),'')), patch.dict(os.environ, {'HOME':str(tmp)}, clear=False):
        assert mini.wait({'id':'run-123','report':str(pulled)}) == 0
        assert not pulled.exists()
        assert mini.read({'id':'run-123','report':str(pulled)}, 'report', pull=True, row=row) == 0
    assert pulled.read_text().startswith('/home/b/result')
    with patch.object(mini, 'query', return_value={'status':'failed', 'verdict':'fail', 'exitCode':1, 'resultPath':None}):
        assert mini.wait({'id':'failed-run','report':str(tmp/'absent.md')}) == 1
    with patch.object(mini, "MM", str(tmp / "missing-mm")):
        assert not mini.available()
    status_bin = tmp/'status-bin'; status_bin.mkdir()
    status_fleet = status_bin/'fleet'
    status_fleet.write_text('''#!/bin/sh
echo '[{"runId":"old-run","status":"done"}]'
''')
    status_fleet.chmod(0o755)
    def local_call(script, payload, timeout=30):
        data = base64.b64encode(json.dumps(payload).encode()).decode()
        return subprocess.run([sys.executable, '-c', script, data], capture_output=True, text=True)
    launch_bin = tmp/'launch-bin'; launch_bin.mkdir()
    launch_fleet = launch_bin/'fleet'
    launch_fleet.write_text('#!/bin/sh\necho "runId: directory-run"\n')
    launch_fleet.chmod(0o755)
    for configured in (launch_bin, launch_fleet):
        with patch.object(mini, 'REMOTE_BIN', str(configured)), patch.object(mini, 'call', local_call), patch.object(mini, 'wait', return_value=0), patch.object(mini.os, 'getcwd', return_value=str(tmp)):
            assert mini.launch({**meta, 'report': str(tmp/'report.md')}, ['fleet', 'code', str(brief), '--report', str(tmp/'report.md')]) == 0
            assert mini.forward(['status']) == 0
    # A dispatcher-only cwd must not prevent Mini launch; use the brief repository.
    fallback_brief = tmp/'fallback.md'; fallback_brief.write_text(f'仓库: {tmp}\n')
    with patch.object(mini, 'REMOTE_HOME', str(tmp)), patch.object(mini, 'REMOTE_BIN', str(launch_fleet)), patch.object(mini, 'call', local_call), patch.object(mini, 'wait', return_value=0), patch.object(mini.os, 'getcwd', return_value=str(tmp/'absent')):
        output = io.StringIO()
        with redirect_stdout(output):
            assert mini.launch({'brief':str(fallback_brief), 'report':str(tmp/'report.md'), 'name':'fallback'}, ['fleet','code',str(fallback_brief),'--report',str(tmp/'report.md')]) == 0
        assert 'Mini 工作目录不存在，改用：' + str(tmp) in output.getvalue()
    # Missing report inputs and writable directories sync before Mini launch.
    source_home = tmp / 'source-home'; source_home.mkdir()
    target_home = tmp / 'target-home'; target_home.mkdir()
    source_reports = source_home / '.agent-reports'
    source_file = source_reports / 'day' / 'brief-input.md'; source_file.parent.mkdir(parents=True)
    source_file.write_text('input content')
    source_dir = source_reports / 'new-output'
    existing_dir = source_reports / 'existing'; existing_dir.mkdir()
    (existing_dir / 'nested').mkdir(); (existing_dir / 'nested/data.md').write_text('nested')
    remote_file = target_home / '.agent-reports/day/brief-input.md'
    remote_dir = target_home / '.agent-reports/new-output'
    fake_bin = tmp / 'sync-bin'; fake_bin.mkdir()
    codex = fake_bin / 'codex'; codex.write_text('#!/bin/sh\nexit 0\n'); codex.chmod(0o755)
    sync_meta = {'to':'gpt', 'writes':[str(source_dir)], 'brief':str(brief), 'report':str(source_reports/'result.md'), 'name':'sync'}
    with patch.object(mini, 'LOCAL_HOME', str(source_home)), patch.object(mini, 'REMOTE_HOME', str(target_home)), patch.object(mini, 'call', local_call), patch.object(mini, 'wait', return_value=0), patch.object(mini, 'REMOTE_BIN', str(launch_fleet)), patch.object(mini.os, 'getcwd', return_value=str(tmp)), patch.dict(os.environ, {'PATH':str(fake_bin)+':'+os.environ['PATH']}):
        assert mini.preflight(sync_meta, [str(source_file), str(source_dir), str(existing_dir)]) is None
        assert remote_file.read_text() == 'input content' and source_dir.is_dir() and remote_dir.is_dir()
        assert (target_home / '.agent-reports/existing/nested/data.md').read_text() == 'nested'
        assert mini.launch(sync_meta, ['fleet','code',str(brief),'--report',sync_meta['report']]) == 0
        assert '缺少路径' in mini.preflight(sync_meta, [str(source_home/'missing-repo')])
        with patch.object(mini, 'sync_reports', side_effect=OSError('failed')):
            assert '同步失败' in mini.preflight(sync_meta, [str(source_reports/'missing')])
        # 本机改过的输入（含 --body 正文）覆盖 Mini 旧副本；Mini 较新的不动。
        body = source_reports / 'day' / 'task.body.md'; body.write_text('新正文')
        remote_body = target_home / '.agent-reports/day/task.body.md'; remote_body.write_text('旧正文')
        os.utime(remote_body, (1000, 1000))
        remote_file.write_text('Mini 上更新的内容')
        os.utime(source_file, (1000, 1000))
        out = io.StringIO()
        with redirect_stdout(out):
            assert mini.preflight({**sync_meta, 'body': str(body)}, [str(source_file)]) is None
        assert remote_body.read_text() == '新正文' and '（覆盖）' in out.getvalue()
        assert remote_file.read_text() == 'Mini 上更新的内容'
        # 需要的命令：显式行 + 已知命令；否定句不算。Mini 缺命令时给出原因。
        assert mini.required_commands('先 kubectl get pods\n禁止用 aws 写\n需要命令: jq、`fleet-no-such-tool`\nkubectl logs') == ['kubectl', 'jq', 'fleet-no-such-tool']
        need = tmp / 'need.brief.md'; need.write_text('需要命令: fleet-no-such-tool\n')
        reason = mini.preflight({**sync_meta, 'brief': str(need)}, [])
        assert reason.startswith(mini.TOOLS_MISSING + 'fleet-no-such-tool'), reason
    # Remote case-preserving filesystem spelling applies to the whole brief and cwd.
    project = tmp / 'PROJECT'; project.mkdir()
    (project / 'repo').mkdir()
    (project / 'writable').mkdir()
    spec = importlib.util.spec_from_file_location('fleet_go', root / 'src/fleet-go.py')
    fleet_go = importlib.util.module_from_spec(spec); spec.loader.exec_module(fleet_go)
    entry = '归类：编码；理由：测试\nREPORT: /tmp/r\n' + fleet_go.EARLY_RULE + '\n动作: 只读\n## 授权覆盖\n允许范围\n## 目标\n修复代码\n## 入口\n仓库：/home/a/Project/repo\n可写路径：/home/a/Project/writable\n'
    with patch.object(mini, 'REMOTE_HOME', str(tmp)), patch.object(mini, 'call', local_call):
        assert not fleet_go.lint(entry, on='mini')
        lint_brief = tmp / 'lint-default.md'; lint_brief.write_text(entry)
        with patch.dict(os.environ, {'FLEET_DEFAULT_ON': 'mini'}), patch.object(sys, 'argv', ['fleet-go', 'lint', str(lint_brief)]):
            fleet_go.main()
        assert any('仓库不存在' in e for e in fleet_go.lint(entry.replace('/repo', '/missing'), on='mini'))
        assert any('仓库不存在' in e for e in fleet_go.lint(entry, on='local'))
        fake_bin = tmp / 'fake-bin'; fake_bin.mkdir()
        codex = fake_bin / 'codex'; codex.write_text('#!/bin/sh\nexit 0\n'); codex.chmod(0o755)
        with patch.dict(os.environ, {'PATH': str(fake_bin) + ':' + os.environ['PATH']}), patch.object(mini.os, 'getcwd', return_value=str(tmp)):
            assert mini.preflight({'to':'gpt'}, ['/home/a/Project/repo', '/home/a/Project/writable']) is None
            assert '缺少路径' in mini.preflight({'to':'gpt'}, ['/home/a/Project/missing'])
    # A failed transport is unknown, while a successful missing-path check is an error.
    with patch.object(mini, 'call', return_value=subprocess.CompletedProcess([], 255, '', 'unreachable')):
        assert not fleet_go.lint(entry, on='mini')
    with patch.object(mini, 'call', side_effect=subprocess.TimeoutExpired('mm', 30)):
        assert not fleet_go.lint(entry, on='mini')
    case_brief = tmp / 'case.md'; case_brief.write_text(f'文件 {tmp}/Project/demo 和 `{tmp}/Project`')
    with patch.object(mini, 'REMOTE_HOME', str(tmp)), patch.object(mini, 'REMOTE_BIN', str(launch_fleet)), patch.object(mini, 'call', local_call), patch.object(mini, 'wait', return_value=0), patch.object(mini.os, 'getcwd', return_value=str(tmp)):
        assert mini.launch({'brief':str(case_brief),'report':str(tmp/'report.md'),'name':'case'}, ['fleet','code',str(case_brief),'--report',str(tmp/'report.md')]) == 0
    assert case_brief.read_text() == f'文件 {tmp}/PROJECT/demo 和 `{tmp}/PROJECT`'
    amend_script = '''import base64,json,pathlib,sys
p=json.loads(base64.b64decode(sys.argv[1]))
''' + mini.CANONICAL_SCRIPT + '''
pathlib.Path(canonical(p['path'])).write_text(canonical(p['text']))
'''
    amended = tmp / 'amended.md'
    result = local_call(amend_script, {'path':str(amended), 'text':f'修改 {tmp}/Project/demo', 'home':str(tmp)})
    assert result.returncode == 0, result.stderr
    assert amended.read_text() == f'修改 {tmp}/PROJECT/demo'
    for configured in (status_bin, status_fleet):
        with patch.object(mini, 'REMOTE_BIN', str(configured)), patch.object(mini, 'call', local_call):
            assert mini.query({'id':'old-run'})['status'] == 'done'
    bin = tmp/'bin'; bin.mkdir()
    fleet = bin/'fleet'
    fleet.write_text('#!/bin/sh\nif [ "$1" = status ]; then echo "[]"; exit 0; fi\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --report ]; then shift; mkdir -p "$(dirname "$1")"; echo result > "$1"; break; fi; shift; done\n')
    fleet.chmod(0o755)
    env = dict(os.environ, HOME=str(tmp), PATH=str(bin)+':'+os.environ['PATH'], FLEET_DEFAULT_ON='mini', FLEET_LOCAL_HOME='/home/a', FLEET_MINI_HOME='/home/b', FLEET_MINI_BIN='/home/b/fleet')
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','fallback','--to','gpt','--goal','x','--no-lint'], env=env, text=True, capture_output=True)
    assert proc.returncode == 0, proc.stderr
    report = next((tmp/'.agent-reports').glob('*/fallback.md'))
    brief = next((tmp/'.agent-reports').glob('*/fallback.brief.md'))
    assert 'Mini 不可达，已在 MacBook 执行' in report.read_text()
    assert 'Mini 不可达，已在 MacBook 执行' in brief.read_text()
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','local-only','--to','gpt','--on','local','--goal','x','--no-lint'], env=env, text=True, capture_output=True)
    assert proc.returncode == 0 and 'Mini 不可达' not in proc.stdout
    mm = tmp/'.claude/skills/macmini/scripts/mm'; mm.parent.mkdir(parents=True)
    mm.write_text('''#!/bin/sh
if [ "$1" = --method ]; then echo direct; else
  case "$1" in
    *status*--json*) echo '{"rows":{},"missing":[]}' ;;
    *) echo '{"missing":["/home/b/missing"],"ready":false}' ;;
  esac
fi
''')
    mm.chmod(0o755)
    default_env = dict(env); default_env.pop('FLEET_DEFAULT_ON')
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','dev-default','--to','gpt','--sol','--goal','x','--no-lint'], env=default_env, text=True, capture_output=True)
    assert proc.returncode == 0 and 'Mini 缺少路径' in proc.stdout, (proc.stdout, proc.stderr)
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','unready','--to','claude','--on','mini','--read','/home/a/missing','--goal','x','--no-lint'], env=env, text=True, capture_output=True)
    assert proc.returncode != 0
    assert 'Mini 缺少路径：/home/a/missing' in proc.stderr and 'claude 通道不可用' in proc.stderr and '未回退' in proc.stderr
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','recheck','--to','gpt','--sol','--read','/home/a/original','--goal','x','--no-lint','--no-launch'], env=env, text=True, capture_output=True)
    assert proc.returncode == 0, proc.stderr
    # 原 brief 标记 Mini，但最新同名 run 在本机时 amend 不应同步到 Mini。
    metadata_path = next((tmp/'.agent-reports').glob('*/recheck.brief.json'))
    metadata = json.loads(metadata_path.read_text()); metadata['execution'] = 'mini'
    metadata_path.write_text(json.dumps(metadata))
    local_state = tmp / '.agent-fleet/runs'; local_state.mkdir(parents=True, exist_ok=True)
    (local_state / 'recheck.json').write_text(json.dumps({'runId':'2026-11-10T12-00-00-000Z-detach-local','name':'recheck','startedAt':'2026-11-10T12:00:00.000Z'}))
    remote_state = tmp / '.agent-fleet/mini-runs'; remote_state.mkdir(parents=True, exist_ok=True)
    (remote_state / 'recheck.json').write_text(json.dumps({'id':'2026-11-10T10-00-00-000Z-detach-mini','name':'recheck','report':'/home/a/r','brief':'/home/a/b'}))
    proc = subprocess.run([str(root/'bin/fleet-go'),'amend','recheck','读取 /home/a/revised','--on','local'], env=env, text=True, capture_output=True)
    assert proc.returncode == 0, proc.stderr
    assert json.loads(next((tmp/'.agent-reports').glob('*/recheck.brief.json')).read_text())['on'] == 'local'
    proc = subprocess.run([str(root/'bin/fleet-go'),'relaunch','recheck','--on','mini'], env=env, text=True, capture_output=True)
    assert proc.returncode != 0 and '未回退' in proc.stderr, proc.stderr
    metadata = json.loads(next((tmp/'.agent-reports').glob('*/recheck.brief.json')).read_text())
    assert '/home/a/original' in metadata['paths'] and '/home/a/revised' in metadata['paths']
spec = importlib.util.spec_from_file_location('fleet_go_tools', root / 'src/fleet-go.py')
fg = importlib.util.module_from_spec(spec); spec.loader.exec_module(fg)
with tempfile.TemporaryDirectory() as d:
    brief = Path(d) / 'tools.brief.md'; brief.write_text('x')
    with patch.object(fg.mini, 'available', return_value=True), patch.object(fg.mini, 'preflight', return_value=mini.TOOLS_MISSING + 'kubectl（x）'), patch.object(fg.subprocess, 'run') as fallback, patch.object(fg.os, 'execvp') as local:
        try:
            fg.launch({'to': 'gpt', 'name': 'tools', 'brief': str(brief), 'report': str(Path(d) / 'r.md'), 'on': None})
            raise AssertionError('should refuse')
        except ValueError as error:
            assert 'Mini 缺命令：kubectl' in str(error) and '未回退本机' in str(error)
        assert not fallback.called and not local.called
# 批量取 Mini 状态：一次调用、Mini 端过滤、失败原因分类。
import datetime
from contextlib import redirect_stderr
with tempfile.TemporaryDirectory() as d:
    tmp = Path(d)
    now = datetime.datetime.now(datetime.timezone.utc)
    iso = lambda minutes: (now - datetime.timedelta(minutes=minutes)).strftime('%Y-%m-%dT%H:%M:%S.000Z')
    runs = tmp / '.agent-fleet/runs'; runs.mkdir(parents=True)
    # 24 小时内：fleet status 返回；24 小时外：只在 run 文件里。
    listed = [{'runId': 'live', 'status': 'running', 'startedAt': iso(120), 'extra': 'x'},
              {'runId': 'old-listed', 'status': 'done', 'startedAt': iso(300), 'finishedAt': iso(180)}]
    (runs / 'old-file.json').write_text(json.dumps({'runId': 'old-file', 'status': 'done', 'startedAt': iso(400), 'finishedAt': iso(300)}))
    (runs / 'recent-file.json').write_text(json.dumps({'runId': 'recent-file', 'status': 'failed', 'startedAt': iso(30), 'finishedAt': iso(5)}))
    (runs / 'stale-file.json').write_text(json.dumps({'runId': 'stale-file', 'status': 'running', 'startedAt': iso(3000)}))
    bin_dir = tmp / 'bin'; bin_dir.mkdir()
    fleet = bin_dir / 'fleet'; fleet.write_text('#!/bin/sh\ncat "$LISTED"\n'); fleet.chmod(0o755)
    (tmp / 'listed.json').write_text(json.dumps(listed))
    recs = [{'id': i, 'name': i, 'brief': 'b'} for i in ('live', 'old-listed', 'old-file', 'recent-file', 'stale-file', 'gone')]
    calls = []
    def local_run(script, payload, timeout=30, kill_group=False):
        calls.append(timeout)
        data = base64.b64encode(json.dumps(payload).encode()).decode()
        env = dict(os.environ, HOME=str(tmp), LISTED=str(tmp / 'listed.json'))
        return subprocess.run([sys.executable, '-c', script, data], capture_output=True, text=True, env=env)
    with patch.object(mini, 'REMOTE_BIN', str(bin_dir)), patch.object(mini, 'call', local_run):
        rows, missing = mini.query_all(recs, since=now.timestamp() - 3600, timeout=7)
        assert sorted(rows) == ['live', 'recent-file', 'stale-file'] and missing == ['gone'], (rows, missing)
        assert set(rows['live']) == set(mini.STATUS_KEYS) and 'extra' not in rows['live']
        rows, missing = mini.query_all(recs)
        assert sorted(rows) == ['live', 'old-file', 'old-listed', 'recent-file', 'stale-file'] and missing == ['gone']
        assert len(calls) == 2 and calls[0] == 7
        fleet.write_text('#!/bin/sh\nexit 1\n')
        try:
            mini.query_all(recs); raise AssertionError('fleet status failure must raise')
        except mini.StatusError as error:
            assert error.reason == 'Mini 端 fleet status 失败'
    # 失败原因：超时 / 连接失败 / 远端异常 / 格式错误，不带远端输出。
    def failing(result):
        outcome = (lambda *a, **k: (_ for _ in ()).throw(result)) if isinstance(result, BaseException) else (lambda *a, **k: result)
        with patch.object(mini, 'call', outcome):
            try: mini.query_all(recs, timeout=2)
            except mini.StatusError as error: return error.reason
        raise AssertionError('should raise')
    done = lambda code, out='', err='': subprocess.CompletedProcess([], code, out, err)
    assert failing(subprocess.TimeoutExpired('mm', 2)) == '超时（2.0 秒内无响应）'
    assert failing(done(255, err='secret-detail')) == '连接失败（exit=255）'
    assert failing(done(1, err='❌ Mac Mini 不可达（直连和 Tailscale 均失败）')) == '连接失败（exit=1）'
    assert failing(done(1, err='secret-detail')) == 'Mini 端取数失败（exit=1）'
    assert failing(done(0, out='not json')) == '返回格式错误'
    assert failing(OSError('no mm')) == '连接失败（本机 mm 命令不可用）'
    # fleet-go.running：300 条记录只调一次 mm；status 模式失败只打印一行原因，其余调用保持 unreachable。
    many = [{'id': f'run-{i}', 'name': f'n{i}', 'brief': f'/b/{i}'} for i in range(300)]
    count = []
    def counted(script, payload, timeout=30, kill_group=False):
        count.append(len(payload['ids']))
        return done(0, json.dumps({'rows': {'run-7': {'runId': 'run-7', 'status': 'running'}, 'run-8': {'runId': 'run-8', 'status': 'done'}}, 'missing': ['run-9']}))
    fake_local = subprocess.CompletedProcess([], 0, '[{"runId": "local-1", "status": "running"}]', '')
    with patch.object(fg.mini, 'records', return_value=many), patch.object(fg.mini, 'call', counted), patch.object(fg.subprocess, 'run', return_value=fake_local):
        got = fg.running(False, status_timeout=5, recent_seconds=3600)
        assert count == [300] and [r['runId'] for r in got] == ['local-1', 'run-7', 'run-8', 'run-9']
        assert got[1]['location'] == 'mini' and got[1]['briefPath'] == '/b/7' and got[1]['state'] == 'running' and got[3]['status'] == 'unreachable'
        assert [r['runId'] for r in fg.running(True)] == ['local-1', 'run-7', 'run-9']
    with patch.object(fg.mini, 'records', return_value=many), patch.object(fg.mini, 'call', lambda *a, **k: done(255, err='x')), patch.object(fg.subprocess, 'run', return_value=fake_local):
        err = io.StringIO()
        with redirect_stderr(err):
            got = fg.running(False, status_timeout=5)
        assert [r['runId'] for r in got] == ['local-1'] and err.getvalue() == 'Mini 状态未取到：连接失败（exit=255）\n', err.getvalue()
        got = fg.running(False)
        assert len(got) == 301 and got[1]['status'] == 'unreachable'
print('PASS: path rewrite, mini command assembly, unavailable fallback')
