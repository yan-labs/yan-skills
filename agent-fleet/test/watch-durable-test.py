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
    write(runs / (child + '.json'), {**state, 'runId': child, 'status': 'failed', 'verdict': 'partial', 'parentRunId': live_id})
    assert 'fixture question' in run([fleet, 'wait', child]).stdout
    assert 'fixture question' not in run([fleet, 'wait', child]).stdout
    with closing(store['connect']()) as db:
        watch['reconcile'](db, runs, time.time())
        watch['reconcile'](db, runs, time.time())
    snap = store['request']('snapshot', {'seat': seat})
    assert snap['unread'] == 1 and snap['running'] == 1
    assert {e['kind'] for e in snap['events']} == {'stall'}
    with closing(store['connect']()) as db:
        assert [(r['kind'], r['summary'] if r['kind'] == 'terminal' else None, r['acked_by'])
                for r in db.execute('SELECT * FROM events WHERE run=? ORDER BY kind', (child,))] == [
                    ('ask', None, 'wait'), ('terminal', 'partial/failed', 'wait')]

    # Script-only patrol batches changed evidence, then reuses the six-question review.
    with closing(store['connect']()) as db:
        now = time.time()
        original = watch['patrol'](db, runs, now)
        fact = next(row for row in original['rows'] if row['runId'] == live_id)
        assert original['reviewBatch'] == [live_id] and fact['intervalMinutes'] == 10
        reviewed = watch['patrol'](db, runs, now + 1, {live_id: {
            'evidence': fact['evidence'], 'verdict': '逐项复核完成', 'inputTokens': 900}})
        assert not reviewed['reviewBatch'] and reviewed['rows'][0]['inputTokens'] == 900
        assert reviewed['rows'][0]['reusedAt'] == now + 1

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
    stall = snap['events'][0]['id']
    assert '本席在跑 1 单、未读 1 条' in message and live_id in message and '--session B' in message
    assert ask['id'] not in message
    assert '仅可查看' in invoke_hook('A', 'UserPromptSubmit').stdout
    assert run([fleet, 'watch', 'ack', stall, '--session', 'A', '--seat', seat]).returncode == 1
    assert run([fleet, 'watch', 'ack', stall, '--session', 'B', '--seat', seat]).returncode == 0
    assert json.loads(run([fleet, 'watch', 'status', '--seat', seat], check=True).stdout)['unread'] == 0
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


def verify_lines(root, runs, repo, seat):
    def hook_for(session, event='UserPromptSubmit', env=None):
        return run([fleet, 'watch', 'hook'], input=json.dumps(dict(
            session_id=session, hook_event_name=event, cwd=str(repo))), env=env, check=True)

    stub = root / 'codex'
    env = {**os.environ, 'FLEET_CODEX_BIN': str(stub), 'FLEET_CODEX_BACKEND': 'exec',
           'FLEET_NO_ARCHIVE_SWEEP': '1', 'TEST_COUNT': str(root / 'line-executions')}
    env_file = root / 'claude-env'
    env.pop('FLEET_SEAT', None)
    env.pop('FLEET_LINE', None)
    results = {}
    for session, line in [('session-a', 'session-a'), ('session-b', 'operations')]:
        context = {**env, 'CLAUDE_ENV_FILE': str(env_file)}
        if session != line:
            context['FLEET_LINE'] = line
        hook_for(session, 'SessionStart', context)
        assert f'export FLEET_DISPATCH_SESSION={session}' in env_file.read_text()
        context['FLEET_DISPATCH_SESSION'] = session
        reply = run([fleet, 'code', 'fixture', '--no-wait'], cwd=repo, env=context, check=True)
        run_id = next(line.split()[1] for line in reply.stdout.splitlines() if line.startswith('runId: '))
        run([fleet, 'wait', run_id], env=context, check=True)
        saved = json.loads((runs / (run_id + '.json')).read_text())
        assert saved['dispatchSession'] == session and saved['watchSeat'] == f'{seat}#{line}'
        ask = run([fleet, 'ask', '--run', run_id, session], cwd=repo, env=context, check=True)
        results[session] = (line, json.loads(ask.stdout)['id'], context)

    for session, (line, event, context) in results.items():
        other = next(item[1] for key, item in results.items() if key != session)
        reply = hook_for(session, env=context).stdout
        assert event in reply and other not in reply
        prefix = [fleet, 'watch', 'ack']
        flags = ['--session', session, '--seat', f'{seat}#{line}']
        assert run([*prefix, other, *flags]).returncode == 1
        if session == line:
            # A new session inherits the original session's stable line name.
            next_ctx = {**context, 'FLEET_LINE': line}
            assert event in hook_for('successor', 'SessionStart', next_ctx).stdout
            assert run([*prefix, event, *flags]).returncode == 1
            flags[1] = 'successor'
        assert run([*prefix, event, *flags]).returncode == 0

    cache = Path(env['FLEET_WATCH_CACHE'])
    cache.chmod(0o755)
    db_root = Path(env['FLEET_WATCH_DIR'])
    db_root.chmod(0o755)
    hook_for('permissions', env=env)
    assert cache.stat().st_mode & 0o777 == db_root.stat().st_mode & 0o777 == 0o700
    bad_cache = root / 'not-a-directory'
    bad_cache.touch()
    result = hook_for('broken-cache', env={**env, 'FLEET_WATCH_CACHE': str(bad_cache / 'cache')})
    assert not result.stderr and not result.stdout


def verify_backfill(root, runs, repo, seat):
    run_id = 'fixture-detach-cutover'
    line = seat + '#cutover'
    state = {'runId': run_id, 'cwd': str(repo), 'dispatchSession': 'cutover', 'detach': True,
             'status': 'done', 'verdict': 'ok', 'finishedAt': store['now_iso']()}
    write(runs / f'{run_id}.json', state)
    legacy = dict(id='legacy-seen', runId=run_id, kind='help', text='already shown', at=store['now_iso']())
    write(runs / f'{run_id}.asks', legacy)
    write(runs / f'{run_id}.asks-seen', [legacy['id']])
    status = lambda: store['request']('snapshot', {'seat': line})
    listen = [fleet, 'watch', 'listen', '--seat', line, '--once']
    before = status()
    assert before['unread'] == 0 and not run(listen, check=True).stdout
    for _ in range(2):
        run([sys.executable, FLEET / 'bin/fleet-watch.py', '--once'], check=True)
    after = status()
    assert [(e['run'], e['kind'], e['summary']) for e in after['events']] == [(run_id, 'terminal', 'ok/done')]
    assert json.loads(run(listen, check=True).stdout) == {'seat': line, 'unread': 1}
    assert 'already shown' not in run([fleet, 'wait', run_id]).stdout
    assert status()['unread'] == 0 and not run(listen, check=True).stdout
    with closing(store['connect']()) as db:
        assert db.execute('SELECT seat,state FROM runs WHERE id=?', (run_id,)).fetchone()[:] == (line, 'done')
        assert db.execute('SELECT COUNT(*) FROM events WHERE run=?', (run_id,)).fetchone()[0] == 2
    print(f"切流夹具 {line} 未读 {before['unread']} → {after['unread']}（ok/done）→ {status()['unread']}（wait 回执）")


def verify_migration(runs, seat):
    parent, child = 'legacy-detach-parent', 'legacy-detach-child'
    with closing(store['connect']()) as db, db:
        for run_id in (parent, child):
            store['bind'](db, run_id, seat=seat)
            store['event'](db, run_id, 'ask', 'legacy question', run_id)
        write(runs / f'{parent}.json', {'runId': parent, 'dispatchSession': 'first'})
        write(runs / f'{child}.json', {'runId': child, 'parentRunId': parent, 'sessionId': 'worker'})
        db.execute('PRAGMA user_version=1')
    assert store['request']('snapshot', {'seat': seat + '#first'})['unread'] == 2


def verify_patrol_review_persistence(root, runs, repo):
    """V1: parked/hold patrol verdicts persist with evidence summary; unchanged reuses, changed invalidates."""
    now_iso = store['now_iso']()
    parked_id = 'fixture-detach-patrol-parked'
    hold_id = 'fixture-detach-patrol-hold'
    parked_report = root / 'patrol-parked.md'
    hold_report = root / 'patrol-hold.md'
    parked_log = runs / f'{parked_id}.log'
    hold_log = runs / f'{hold_id}.log'
    parked_log.write_text('parked initial log\n')
    hold_log.write_text('hold initial log\n')
    os.utime(parked_log, (1700000100, 1700000100))
    os.utime(hold_log, (1700000100, 1700000100))
    write(runs / f'{parked_id}.json', {
        'runId': parked_id, 'cwd': str(repo), 'detach': True, 'status': 'running',
        'heartbeatAt': now_iso, 'startedAt': now_iso, 'reportPath': str(parked_report),
    })
    write(runs / f'{parked_id}.yield', {'type': 'park', 'until': 'job:123', 'owner': '本单'})
    os.utime(runs / f'{parked_id}.yield', (1700000100, 1700000100))
    write(runs / f'{hold_id}.json', {
        'runId': hold_id, 'cwd': str(repo), 'detach': True, 'status': 'running',
        'heartbeatAt': now_iso, 'startedAt': now_iso, 'reportPath': str(hold_report),
    })

    # Test 1: persist parked & 不动 verdicts via CLI --record-reviews, then reuse when evidence is unchanged.
    initial = json.loads(run([fleet, 'watch', 'patrol'], check=True).stdout)
    by_id = {row['runId']: row for row in initial['rows']}
    assert parked_id in initial['reviewBatch'] and hold_id in initial['reviewBatch']
    assert by_id[parked_id]['state'] == 'parked'
    assert by_id[parked_id]['evidenceSummary'] == {
        'logSize': len('parked initial log\n'), 'lastUpdatedAt': 1700000100.0, 'artifactCount': 0,
    }
    assert by_id[hold_id]['evidenceSummary'] == {
        'logSize': len('hold initial log\n'), 'lastUpdatedAt': 1700000100.0, 'artifactCount': 0,
    }

    payload = {
        parked_id: {'evidence': by_id[parked_id]['evidence'], 'verdict': 'parked：等待 job，不动', 'inputTokens': 320},
        hold_id: {'evidence': by_id[hold_id]['evidence'], 'verdict': '不动：构建正常推进', 'inputTokens': 410},
    }
    recorded = json.loads(run([fleet, 'watch', 'patrol', '--record-reviews'], input=json.dumps(payload), check=True).stdout)
    rec_by_id = {row['runId']: row for row in recorded['rows']}
    assert rec_by_id[parked_id]['review'] == 'parked：等待 job，不动'
    assert rec_by_id[hold_id]['review'] == '不动：构建正常推进'
    assert parked_id not in recorded['reviewBatch'] and hold_id not in recorded['reviewBatch']
    assert rec_by_id[parked_id]['reusedAt'] is not None and rec_by_id[hold_id]['reusedAt'] is not None

    # Next patrol with identical evidence (even after heartbeat updates) reuses saved verdicts without re-checking.
    write(runs / f'{parked_id}.json', {
        'runId': parked_id, 'cwd': str(repo), 'detach': True, 'status': 'running',
        'heartbeatAt': store['now_iso'](), 'startedAt': now_iso, 'reportPath': str(parked_report),
    })
    reused = json.loads(run([fleet, 'watch', 'patrol'], check=True).stdout)
    reused_by_id = {row['runId']: row for row in reused['rows']}
    assert reused_by_id[parked_id]['review'] == 'parked：等待 job，不动'
    assert reused_by_id[parked_id]['reusedAt'] == rec_by_id[parked_id]['reusedAt']
    assert reused_by_id[hold_id]['review'] == '不动：构建正常推进'
    assert reused_by_id[hold_id]['reusedAt'] == rec_by_id[hold_id]['reusedAt']
    assert parked_id not in reused['reviewBatch'] and hold_id not in reused['reviewBatch']

    # Test 2: evidence changes (log size, lastUpdatedAt, artifactCount) invalidate cached verdicts and require re-review.
    # 2a) Log size grows on parked run -> invalidated.
    parked_log.write_text('parked initial log\nnew wake output\n')
    os.utime(parked_log, (1700000100, 1700000100))
    after_log = json.loads(run([fleet, 'watch', 'patrol'], check=True).stdout)
    after_log_by_id = {row['runId']: row for row in after_log['rows']}
    assert after_log_by_id[parked_id]['evidenceSummary']['logSize'] == len('parked initial log\nnew wake output\n')
    assert after_log_by_id[parked_id]['review'] is None and after_log_by_id[parked_id]['reusedAt'] is None
    assert parked_id in after_log['reviewBatch']
    assert hold_id not in after_log['reviewBatch'] and after_log_by_id[hold_id]['review'] == '不动：构建正常推进'

    # Re-record parked verdict, then mutate only lastUpdatedAt (same size, same artifact count) -> invalidated.
    rerecord = json.loads(run(
        [fleet, 'watch', 'patrol', '--record-reviews'],
        input=json.dumps({parked_id: {'evidence': after_log_by_id[parked_id]['evidence'], 'verdict': 'parked：复审不动'}}),
        check=True,
    ).stdout)
    assert parked_id not in rerecord['reviewBatch']
    os.utime(parked_log, (1700000200, 1700000200))
    after_mtime = json.loads(run([fleet, 'watch', 'patrol'], check=True).stdout)
    after_mtime_by_id = {row['runId']: row for row in after_mtime['rows']}
    assert after_mtime_by_id[parked_id]['evidenceSummary']['lastUpdatedAt'] == 1700000200.0
    assert after_mtime_by_id[parked_id]['review'] is None and parked_id in after_mtime['reviewBatch']

    # 2b) Artifact count increases on hold run (with same mtime) -> invalidated.
    hold_report.write_text('# report draft\n')
    os.utime(hold_report, (1700000100, 1700000100))
    after_artifact = json.loads(run([fleet, 'watch', 'patrol'], check=True).stdout)
    after_artifact_by_id = {row['runId']: row for row in after_artifact['rows']}
    assert after_artifact_by_id[hold_id]['evidenceSummary']['artifactCount'] == 1
    assert after_artifact_by_id[hold_id]['review'] is None and after_artifact_by_id[hold_id]['reusedAt'] is None
    assert hold_id in after_artifact['reviewBatch']


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
        worker_keys = ('FLEET_SLOT_RUN_ID', 'FLEET_DETACHED_RUN_ID', 'FLEET_PARENT_RUN_ID')
        with patch.dict(os.environ, {**dict.fromkeys(worker_keys, ''), 'FLEET_SEAT': seat, 'AGENT_FLEET_RUNS_DIR': str(runs), 'FLEET_WATCH_DIR': str(root / 'db'),
                                     'FLEET_WATCH_CACHE': str(root / 'cache')}):
            verify_mailbox(root, runs, repo, seat)
            verify_patrol_review_persistence(root, runs, repo)
            verify_timer(root, runs, repo, seat)
            verify_lines(root, runs, repo, seat)
            verify_migration(runs, seat)
            verify_backfill(root, runs, repo, seat)
    print('PASS SQLite、旧 wait、离线三类事件、接班和迟到确认、巡检裁定持久化、定时派发崩溃重放')


if __name__ == '__main__':
    main()
