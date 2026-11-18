"""Exercise the Mini mailbox, legacy wait, crash replay and Claude handover without a model call."""
from contextlib import closing
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import runpy
import signal
import subprocess
import sys
from tempfile import TemporaryDirectory
import time
from unittest.mock import patch

FLEET = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FLEET / 'src'))
watch = runpy.run_path(str(FLEET / 'bin/fleet-watch.py'))
store = watch['store']
hook = FLEET / 'hooks/fleet-seat.py'
fleet = FLEET / 'bin/fleet'


def run(args, **kwargs):
    return subprocess.run(args, text=True, capture_output=True, timeout=30, **kwargs)


def write(path, data):
    path.write_text(json.dumps(data))


def verify_mailbox(root, runs, repo, seat):
    old = time.time() - 2000
    iso = datetime.fromtimestamp(old, timezone.utc).isoformat()
    live_id = 'fixture-detach-offline'
    child = 'fixture-detach-child'
    state = {'runId': live_id, 'cwd': str(repo), 'detach': True, 'status': 'running',
             'heartbeatAt': store['now_iso'](), 'startedAt': iso, 'model': 'codex-terra'}
    write(runs / (live_id + '.json'), state)
    log = runs / (live_id + '.log')
    log.write_text('[agent-fleet 1s] last real work\n[agent-fleet 2000s] still waiting…\n')
    write(runs / (child + '.json'), {**state, 'runId': child, 'parentRunId': live_id, 'cwd': str(root)})
    write(runs / (child + '.queue.json'), {'state': 'queued'})
    invoke_hook = lambda session, event, env=None: run([fleet, 'watch', 'hook'], input=json.dumps(dict(
        session_id=session, hook_event_name=event, cwd=str(repo))), env=env, check=True)
    assert '本席在跑' in invoke_hook('A', 'SessionStart').stdout

    # No Book process is attached while the three event types accumulate.
    started = time.monotonic()
    reply = run([fleet, 'ask', '--run', child, 'fixture question'], cwd=root, check=True)
    ask = json.loads(reply.stdout)
    assert time.monotonic() - started < 60
    assert store['request']('snapshot', {'seat': seat})['unread'] == 1
    print(f'ask 到可读 {time.monotonic() - started:.2f}s')
    write(runs / (child + '.json'), {**state, 'runId': child, 'status': 'done', 'parentRunId': live_id})
    assert 'fixture question' in run([fleet, 'wait', child]).stdout
    assert (runs / (child + '.asks-seen')).exists()
    with closing(store['connect']()) as db:
        watch['reconcile'](db, runs, time.time())
        watch['reconcile'](db, runs, time.time())
    snap = store['request']('snapshot', {'seat': seat})
    assert snap['unread'] == 3 and snap['running'] == 1
    assert {e['kind'] for e in snap['events']} == {'ask', 'stall', 'terminal'}
    assert sum(e['id'] == ask['id'] for e in snap['events']) == 1

    # Force the SSH branch offline using a local transport stub.
    ssh = root / 'ssh'
    ssh.write_text('#!/bin/sh\nexit 255\n')
    ssh.chmod(0o755)
    fake_home = root / 'unreachable-home'
    fake_home.mkdir()
    with patch.dict(os.environ, {'PATH': str(root) + ':' + os.environ['PATH']}):
        # Keep the fixture repository seat, while exercising the same path used on Book.
        pickup = runpy.run_path(str(hook))['pickup']
        with patch.dict(pickup.__globals__['store'], {'remote_machine': lambda: True}):
            offline = pickup(dict(session_id='B', cwd=str(repo)))
            assert '未同步，缓存时间 20' in offline and '在跑' not in offline
            with patch.dict(os.environ, {'FLEET_WATCH_CACHE': str(fake_home)}):
                assert '未同步，缓存时间 无' in pickup(dict(session_id='C', cwd=str(repo)))
    message = invoke_hook('B', 'UserPromptSubmit').stdout
    assert '本席在跑 1 单、未读 3 条' in message and ask['id'] in message and '--session B' in message
    assert '仅可查看' in invoke_hook('A', 'UserPromptSubmit').stdout
    assert run([fleet, 'watch', 'ack', ask['id'], '--session', 'A']).returncode == 1
    assert run([fleet, 'watch', 'ack', ask['id'], '--session', 'B']).returncode == 0
    assert json.loads(run([fleet, 'watch', 'status', '--seat', seat], check=True).stdout)['unread'] == 2
    with patch.dict(os.environ, {'FLEET_SLOT_RUN_ID': live_id}):
        assert not invoke_hook('worker', 'SessionStart').stdout

    # A parked or queued run can be old without causing a stall notification.
    for waiting in ('queued', 'parked'):
        run_id = f'fixture-detach-{waiting}'
        write(runs / (run_id + '.json'), {**state, 'runId': run_id, 'heartbeatAt': iso})
        if waiting == 'queued':
            write(runs / (run_id + '.queue.json'), {'state': waiting})
        else:
            write(runs / (run_id + '.yield'), {'type': 'park', 'until': 'reply'})
    with closing(store['connect']()) as db:
        watch['reconcile'](db, runs, time.time())
        assert db.execute("SELECT COUNT(*) FROM runs WHERE state IN ('queued','parked')").fetchone()[0] == 2
        assert db.execute('SELECT COUNT(*) FROM events').fetchone()[0] == 3
        write(runs / (live_id + '.json'), {**state, 'heartbeatAt': iso})
        watch['reconcile'](db, runs, time.time())
        assert db.execute("SELECT COUNT(*) FROM events WHERE kind='stall'").fetchone()[0] == 2
        write(runs / (live_id + '.json'), {**state, 'heartbeatAt': iso, 'pid': 2147483647})
        watch['reconcile'](db, runs, time.time())
        assert db.execute("SELECT state FROM runs WHERE id=?", (live_id,)).fetchone()[0] == 'failed'
        assert json.loads((runs / (live_id + '.json')).read_text())['status'] == 'running'


def verify_timer(root, runs, repo, seat):
    stub = root / 'codex'
    count = root / 'executions'
    stub.write_text('''#!/bin/sh
printf 'started\\n' >> "$TEST_COUNT"
while [ "$#" -gt 0 ]; do
  if [ "$1" = '-o' ]; then shift; out=$1; fi
  shift
done
cat >/dev/null
printf 'fixture result\\n' > "$out"
''')
    stub.chmod(0o755)
    wrapper = root / 'crash-after-launch'
    wrapper.write_text('''#!/bin/sh
"$TEST_FLEET" "$@" || exit $?
kill -KILL "$PPID"
''')
    wrapper.chmod(0o755)
    due = time.time() - 1
    with closing(store['connect']()) as db, db:
        db.execute('INSERT INTO timers VALUES (?,?,?,?,?,?)',
                   ('fixture', seat, 'once', 'Asia/Taipei',
                    json.dumps(dict(argv=['code', 'fixture brief'], cwd=str(repo))), due))
    script = """
from contextlib import closing
from pathlib import Path
import runpy, sys, time
watch = runpy.run_path(sys.argv[1])
with closing(watch['store']['connect']()) as db:
    watch['dispatch'](db, time.time(), Path(sys.argv[2]))
"""
    with patch.dict(os.environ, {'FLEET_CODEX_BIN': str(stub), 'FLEET_CODEX_BACKEND': 'exec',
                                 'FLEET_NO_ARCHIVE_SWEEP': '1', 'TEST_COUNT': str(count), 'TEST_FLEET': str(fleet)}):
        args = [sys.executable, '-c', script, FLEET / 'bin/fleet-watch.py']
        crashed = run([*args, wrapper])
        assert crashed.returncode == -signal.SIGKILL, crashed.stderr
        with closing(store['connect']()) as db:
            timer = db.execute('SELECT * FROM timers').fetchone()
            run_id = watch['timer_run'](timer)
            assert timer['due'] == due
        run([*args, fleet], check=True)
        run([fleet, 'wait', run_id], check=True)
        assert count.read_text().splitlines() == ['started']
        assert len(list(runs.glob('timer-*.log'))) == 1
    with closing(store['connect']()) as db:
        assert db.execute('SELECT due FROM timers').fetchone()[0] is None
    assert watch['next_due'](dict(rule='daily 08:00', timezone='Asia/Taipei', due=0), 0) == 86400


def main():
    with TemporaryDirectory() as tmp:
        root = Path(tmp)
        repo = root / 'repo'
        run(['git', 'init', repo], check=True)
        run(['git', '-C', repo, 'remote', 'add', 'origin', 'git@github.com:fixture/watch.git'], check=True)
        mirror = root / 'different-layout'
        run(['git', 'init', mirror], check=True)
        run(['git', '-C', mirror, 'remote', 'add', 'origin', 'https://github.com/fixture/watch.git'], check=True)
        seat = store['seat_for'](str(repo))
        assert seat == store['seat_for'](str(mirror)) == 'github.com/fixture/watch'
        runs = root / 'runs'
        runs.mkdir()
        with patch.dict(os.environ, {'AGENT_FLEET_RUNS_DIR': str(runs), 'FLEET_WATCH_DIR': str(root / 'db'),
                                     'FLEET_WATCH_CACHE': str(root / 'cache')}):
            verify_mailbox(root, runs, repo, seat)
            verify_timer(root, runs, repo, seat)
    print('PASS SQLite、旧 wait、离线三类事件、接班和迟到确认、定时派发崩溃重放')


if __name__ == '__main__':
    main()
