import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from unittest.mock import patch

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'src'))
import mini

mini.LOCAL_HOME = '/home/a'
mini.REMOTE_HOME = '/home/b'
mini.REMOTE_BIN = '/home/b/fleet'

assert mini.remote_path('/home/a/Project/x') == '/home/b/Project/x'
assert mini.remote_path('/home/a-archive') == '/home/a-archive'
assert mini.rewrite_brief('正文 /home/a/keep\n- 文本 /home/a/keep\n- /home/a/file\n') == '正文 /home/a/keep\n- 文本 /home/a/keep\n- /home/b/file\n'
assert mini.referenced_paths('private/input.txt') == [str(Path.cwd() / 'private/input.txt')]
assert mini.rewrite_brief('REPORT: /home/a/r\n普通内容 /home/a-archive') == 'REPORT: /home/b/r\n普通内容 /home/a-archive'
assert mini.referenced_paths('./private/input $HOME/note') == [str(Path.cwd() / 'private/input'), str(Path.home() / 'note')]
assert mini.local_path('/home/b/Project/x') == '/home/a/Project/x'
assert '/home/a/.agent-reports/rules-slim' in mini.referenced_paths('读取 /home/a/.agent-reports/rules-slim，或 ~/notes')
assert not mini.referenced_paths('https://example.com/a')
with patch.object(mini, 'call', return_value=subprocess.CompletedProcess([], 0, json.dumps({'missing':['/home/b/a'], 'ready':False}), '')):
    reason = mini.preflight({'to':'claude'}, ['/home/a/a'])
    assert 'Mini 缺少路径：/home/a/a' in reason and 'claude 通道不可用' in reason
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
    bin = tmp/'bin'; bin.mkdir()
    fleet = bin/'fleet'
    fleet.write_text('#!/bin/sh\nif [ "$1" = status ]; then echo "[]"; exit 0; fi\nwhile [ "$#" -gt 0 ]; do if [ "$1" = --report ]; then shift; mkdir -p "$(dirname "$1")"; echo result > "$1"; break; fi; shift; done\n')
    fleet.chmod(0o755)
    env = dict(os.environ, HOME=str(tmp), PATH=str(bin)+':'+os.environ['PATH'], FLEET_DEFAULT_ON='mini', FLEET_LOCAL_HOME='/home/a', FLEET_MINI_HOME='/home/b', FLEET_MINI_BIN='/home/b/fleet')
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','fallback','--to','gpt','--goal','x'], env=env, text=True, capture_output=True)
    assert proc.returncode == 0, proc.stderr
    report = next((tmp/'.agent-reports').glob('*/fallback.md'))
    brief = next((tmp/'.agent-reports').glob('*/fallback.brief.md'))
    assert 'Mini 不可达，已在 MacBook 执行' in report.read_text()
    assert 'Mini 不可达，已在 MacBook 执行' in brief.read_text()
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','local-only','--to','gpt','--on','local','--goal','x'], env=env, text=True, capture_output=True)
    assert proc.returncode == 0 and 'Mini 不可达' not in proc.stdout
    mm = tmp/'.claude/skills/macmini/scripts/mm'; mm.parent.mkdir(parents=True)
    mm.write_text('''#!/bin/sh
if [ "$1" = --method ]; then echo direct; else echo '{"missing":["/home/b/missing"],"ready":false}'; fi
''')
    mm.chmod(0o755)
    default_env = dict(env); default_env.pop('FLEET_DEFAULT_ON')
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','dev-default','--to','gpt','--goal','x'], env=default_env, text=True, capture_output=True)
    assert proc.returncode == 0 and 'Mini 缺少路径' in proc.stdout
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','unready','--to','claude','--on','mini','--read','/home/a/missing','--goal','x'], env=env, text=True, capture_output=True)
    assert proc.returncode == 0, proc.stderr
    assert 'Mini 缺少路径：/home/a/missing' in proc.stdout and 'claude 通道不可用' in proc.stdout
    report = next((tmp/'.agent-reports').glob('*/unready.md'))
    assert 'claude 通道不可用' in report.read_text()
    proc = subprocess.run([str(root/'bin/fleet-go'),'new','recheck','--to','gpt','--read','/home/a/original','--goal','x','--no-launch'], env=env, text=True, capture_output=True)
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
    assert proc.returncode == 0, proc.stderr
    metadata = json.loads(next((tmp/'.agent-reports').glob('*/recheck.brief.json')).read_text())
    assert '/home/a/original' in metadata['paths'] and '/home/a/revised' in metadata['paths']
print('PASS: path rewrite, mini command assembly, unavailable fallback')
