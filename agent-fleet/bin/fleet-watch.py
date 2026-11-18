#!/usr/bin/env python3
"""Read Mini run evidence and dispatch due timers on the Mini."""
import argparse
from contextlib import closing
from datetime import datetime, time as clock, timedelta
import hashlib
import json
import os
from pathlib import Path
import re
import runpy
import subprocess
import sys
import time
from zoneinfo import ZoneInfo

FLEET = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FLEET / 'src'))
store = runpy.run_path(str(FLEET / 'src/watch-store.py'))
WAITING = ('queued', 'parked', 'waiting')
HEARTBEAT_SECONDS = 90
STALLED_SECONDS = 1800
RUN_ID = re.compile(r'[\w.-]+', re.ASCII)
IDLE_LINE = re.compile(rb'\[agent-fleet (\d+)s\] still waiting')
PROGRESS_AT = re.compile(rb'\[agent-fleet (\d+)s\]')
TIMER_COMMANDS = {'code', 'run', 'run-many', 'grok-cli', 'copy', 'bulk', 'haiku', 'sonnet', 'opus', 'fable', 'gpt', 'openai', 'judge'}


record = store['read_record']


def timestamp(value, fallback):
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except (ValueError, AttributeError):
        return fallback


def record_alive(pid, command):
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    if not command:
        return True
    actual = subprocess.run(['/bin/ps', '-o', 'command=', '-p', str(pid)],
                            capture_output=True, text=True, timeout=2).stdout.strip()
    return not actual or actual == command


def progress(path, since):
    try:
        with path.open('rb') as log:
            info = os.fstat(log.fileno())
            offset = max(0, info.st_size - 65536)
            log.seek(offset)
            tail = log.read()
    except FileNotFoundError:
        return None, since
    last_idle = None
    for line in reversed(tail.splitlines(keepends=True)):
        end = offset + len(tail)
        tail = tail[:-len(line)]
        idle = IDLE_LINE.match(line)
        if idle:
            last_idle = last_idle or idle
            continue
        actual = PROGRESS_AT.match(line)
        elapsed = max(0, int(last_idle[1]) - int(actual[1])) if last_idle and actual else 0
        return f'{info.st_ino}:{end}', max(since, info.st_mtime - elapsed)
    return None, since


def transition(db, row, state, now):
    if row['state'] == state:
        return
    sequence = row['transition'] + 1
    db.execute('UPDATE runs SET state=?, transition=?, changed=? WHERE id=?', (state, sequence, now, row['id']))
    if state in store['TERMINAL'] or state in ('heartbeat', 'stalled'):
        kind = 'terminal' if state in store['TERMINAL'] else 'stall'
        reason = {'heartbeat': '监督心跳超过 90 秒', 'stalled': '进度超过 30 分钟未更新'}.get(state, state)
        store['event'](db, row['id'], kind, reason, f"{row['id']}:{sequence}")


def legacy_asks(db, path, run):
    try:
        with path.open() as log:
            for line in log:
                try:
                    ask = json.loads(line)
                except ValueError:
                    continue
                if (not isinstance(ask, dict) or ask.get('runId') != run
                        or not {'id', 'kind', 'text', 'at'} <= ask.keys()
                        or db.execute('SELECT 1 FROM events WHERE id=?', (ask['id'],)).fetchone()):
                    continue
                result = subprocess.run([str(FLEET / 'bin/redact')], input=ask['text'],
                                        capture_output=True, text=True, check=True, timeout=5)
                store['record_ask'](db, {**ask, 'text': result.stdout.strip()})
    except FileNotFoundError:
        pass


def reconcile(db, root, now):
    with db:
        db.execute('BEGIN IMMEDIATE')
        known = {row['id']: row for row in db.execute('SELECT * FROM runs')}
        records = {}
        for path in root.glob('attach-*.queue.json'):
            run = path.name.removesuffix('.queue.json')
            queue = record(path)
            if run.startswith('attach-') and queue.get('state') in (*WAITING, 'running'):
                records[run] = (queue, {}, True)
        for path in root.glob('*-detach-*.json'):
            if path.name.removesuffix('.json') in known:
                continue
            try:
                if now - path.stat().st_mtime > 86400:
                    continue
            except FileNotFoundError:
                continue
            rec = record(path)
            if rec.get('detach') and path.name == rec.get('runId', '') + '.json':
                records[rec['runId']] = (rec, None, False)
        for run, row in known.items():
            if row['state'] in store['TERMINAL']:
                continue
            if RUN_ID.fullmatch(run) and run not in ('.', '..'):
                attached = run.startswith('attach-')
                rec = record(root / (run + ('.queue.json' if attached else '.json')))
                records[run] = (rec, {} if attached else None, attached)

        def discover(run):
            if run in known:
                return
            rec, _, attached = records[run]
            if not rec or (rec.get('state' if attached else 'status') in store['TERMINAL']):
                return
            parent = rec.get('parentRunId')
            repo = (rec.get('object') or {}).get('repo')
            if rec.get('briefPath'):
                repo = repo or (record(Path(rec['briefPath']).with_suffix('.json')).get('object') or {}).get('repo')
            store['bind'](db, run, cwd=rec.get('cwd'), parent=parent, repo=repo)
            known[run] = db.execute('SELECT * FROM runs WHERE id=?', (run,)).fetchone()

        collected = {}
        for run, (rec, queue, attached) in records.items():
            discover(run)
            row = known.get(run)
            if row is None or row['state'] in store['TERMINAL']:
                continue
            legacy_asks(db, root / (run + '.asks'), run)
            state = rec.get('state' if attached else 'status')
            if not state:
                if now - row['changed'] > HEARTBEAT_SECONDS and row['state'] == 'starting':
                    transition(db, row, 'failed', now)
                continue
            if state not in store['TERMINAL']:
                queue = record(root / (run + '.queue.json')) if queue is None else queue
                scheduled = queue.get('state')
                yielded = record(root / (run + '.yield'))
                stale = not attached and now - timestamp(rec.get('heartbeatAt'), now) > HEARTBEAT_SECONDS
                dead = (stale and rec.get('pid') and not record_alive(rec['pid'], rec.get('command'))
                        and not record_alive(rec.get('childPid'), rec.get('childCommand')))
                if dead:
                    state = 'failed'
                elif scheduled in WAITING:
                    state = scheduled
                elif yielded.get('type') == 'park' and not yielded.get('resolvedAt'):
                    state = 'parked'
                elif stale:
                    state = 'heartbeat'
                else:
                    since = timestamp(rec.get('startedAt'), queue.get('createdAt', now * 1000) / 1000)
                    mark, observed = progress(root / (run + '.log'), since)
                    if row['state'] in WAITING:
                        observed = now
                    elif mark == row['progress'] and row['progressed'] is not None:
                        observed = row['progressed']
                    db.execute('UPDATE runs SET progress=?, progressed=? WHERE id=?', (mark, observed, run))
                    state = 'stalled' if now - observed >= STALLED_SECONDS else 'running'
            transition(db, row, state, now)
            if state in store['ACTIVE']:
                collected[row['seat']] = collected.get(row['seat'], 0) + 1
        return collected


def next_due(timer, now):
    rule = timer['rule']
    if rule == 'once':
        return None
    if not re.fullmatch(r'daily \d\d:\d\d', rule):
        raise ValueError('定时规则须为 once 或 daily HH:MM')
    zone = ZoneInfo(timer['timezone'])
    current = datetime.fromtimestamp(max(now, timer['due']), zone)
    candidate = datetime.combine(current.date(), clock.fromisoformat(rule[6:]), zone)
    return (candidate if candidate.timestamp() > current.timestamp() else candidate + timedelta(days=1)).timestamp()


def timer_run(timer):
    key = json.dumps([timer['id'], timer['due']], separators=(',', ':'))
    return 'timer-' + hashlib.sha256(key.encode()).hexdigest()


def dispatch(db, now, fleet=FLEET / 'bin/fleet'):
    timers = db.execute('SELECT * FROM timers WHERE due<=? ORDER BY due,id', (now,)).fetchall()
    for timer in timers:
        try:
            zone = ZoneInfo(timer['timezone'])
            due = next_due(timer, now)
            action = json.loads(timer['action'])
            argv = action['argv']
            if (not isinstance(argv, list) or not argv or not all(isinstance(arg, str) for arg in argv)
                    or argv[0] not in TIMER_COMMANDS or '--attach' in argv
                    or '--no-wait' in argv or '--help' in argv):
                raise ValueError('定时动作须为 fleet 后台派单参数数组')
            run = timer_run(timer)
            with db:
                db.execute('BEGIN IMMEDIATE')
                store['bind'](db, run, seat=timer['seat'])
            claimed = lambda: db.execute('SELECT timer_claimed FROM runs WHERE id=?', (run,)).fetchone()[0]
            if not claimed():
                env = {**os.environ, 'FLEET_SEAT': timer['seat'], 'FLEET_WATCH_TIMER_RUN': run, 'TZ': zone.key}
                result = subprocess.run([str(fleet), *argv, '--no-wait'], cwd=action['cwd'], env=env,
                                        capture_output=True, timeout=25)
                if not claimed():
                    raise ValueError(f'派单尚未收到持久回执（退出码 {result.returncode}）')
            with db:
                db.execute('UPDATE timers SET due=? WHERE id=? AND due=?', (due, timer['id'], timer['due']))
        except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
            print(f"timer {timer['id']}: {type(error).__name__}", file=sys.stderr, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--once', action='store_true')
    parser.add_argument('--dispatch', action='store_true', help='启用定时派发。默认只采集。')
    args = parser.parse_args()
    root = store['runs_root']()
    with closing(store['connect']()) as db:
        previous = None
        while True:
            started = time.monotonic()
            seats = reconcile(db, root, time.time())
            if args.once or seats != previous:
                print(json.dumps({'runs': sum(seats.values()), 'seats': seats}, ensure_ascii=False), flush=True)
            previous = seats
            if args.dispatch:
                dispatch(db, time.time())
            if args.once:
                return
            time.sleep(max(0, 15 - (time.monotonic() - started)))


if __name__ == '__main__':
    main()
