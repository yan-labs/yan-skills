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


def transition(db, row, state, now, verdict=None):
    if row['state'] == state:
        return
    sequence = row['transition'] + 1
    db.execute('UPDATE runs SET state=?, transition=?, changed=? WHERE id=?', (state, sequence, now, row['id']))
    if state in store['TERMINAL'] or state in ('heartbeat', 'stalled'):
        kind = 'terminal' if state in store['TERMINAL'] else 'stall'
        reason = {'heartbeat': '监督心跳超过 90 秒', 'stalled': '进度超过 30 分钟未更新'}.get(state, store['terminal_summary'](state, verdict))
        key = f"{row['id']}:{sequence}"
        store['event'](db, row['id'], kind, reason, key)
        if kind == 'terminal' and db.execute('SELECT 1 FROM wait_terminals WHERE run=?', (row['id'],)).fetchone():
            db.execute("UPDATE events SET acked_by='wait' WHERE id=?", (key,))


def reconcile(db, root, now):
    with db:
        db.execute('BEGIN IMMEDIATE')
        known = {row['id']: row for row in db.execute('SELECT * FROM runs')}
        records = {}
        for path in root.glob('attach-*.queue.json'):
            run = path.name.removesuffix('.queue.json')
            queue = record(path)
            if (queue.get('runId') == run and
                    (queue.get('state') in (*WAITING, 'running') or
                     (queue.get('state') in store['TERMINAL'] and now - queue.get('finishedAt', 0) / 1000 <= 86400))):
                records[run] = (queue, {}, True)
        for path in (*root.glob('*-detach-*.json'), *root.glob('timer-*.json')):
            if path.name.removesuffix('.json') in known:
                continue
            rec = record(path)
            if (rec.get('detach') and path.name == rec.get('runId', '') + '.json'
                    and (rec.get('status') not in store['TERMINAL']
                         or now - timestamp(rec.get('finishedAt'), 0) <= 86400)):
                records[rec['runId']] = (rec, None, False)
        for run, row in known.items():
            if row['state'] in store['TERMINAL']:
                if RUN_ID.fullmatch(run) and run not in ('.', '..') and (root / (run + '.asks-seen')).exists():
                    store['legacy_asks'](db, root, run)
                continue
            if RUN_ID.fullmatch(run) and run not in ('.', '..'):
                attached = run.startswith('attach-')
                rec = record(root / (run + ('.queue.json' if attached else '.json')))
                records[run] = (rec, {} if attached else None, attached)

        def discover(run):
            if run in known:
                return
            rec, _, attached = records[run]
            if not rec:
                return
            store['bind'](db, run, **store['run_binding'](rec))
            known[run] = db.execute('SELECT * FROM runs WHERE id=?', (run,)).fetchone()

        collected = {}
        for run, (rec, queue, attached) in records.items():
            discover(run)
            row = known.get(run)
            if row is None or row['state'] in store['TERMINAL']:
                continue
            store['legacy_asks'](db, root, run)
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
            transition(db, row, state, now, rec.get('verdict'))
            if state in store['ACTIVE']:
                collected[row['seat']] = collected.get(row['seat'], 0) + 1
        return collected


def patrol(db, root, now, reviews=None):
    """Batch current facts and retain decisions only for identical evidence."""
    db.execute("""CREATE TABLE IF NOT EXISTS patrol (
        run TEXT PRIMARY KEY, evidence TEXT NOT NULL, due REAL NOT NULL,
        reviewed REAL, verdict TEXT, input_tokens INTEGER
    )""")
    rows = []
    with db:
        db.execute('BEGIN IMMEDIATE')
        for row in db.execute("SELECT id,state,seat,progress FROM runs ORDER BY id"):
            if row['state'] not in store['ACTIVE']:
                continue
            run = row['id']
            if not RUN_ID.fullmatch(run) or run in ('.', '..'):
                continue
            pid = record(root / (run + '.pid.json'))
            state = record(root / (run + '.json')) or record(root / (run + '.queue.json'))
            if not pid and state.get('childRunId') and RUN_ID.fullmatch(state['childRunId']):
                pid = record(root / (state['childRunId'] + '.pid.json'))
            yielded = record(root / (run + '.yield'))
            watch = pid.get('supervision') or {}
            brief_path = state.get('briefPath') or pid.get('briefPath')
            meta = store['brief_metadata'](brief_path)
            actions = pid.get('actions') or meta.get('actions') or []
            production = bool('deploy-prod' in (pid.get('auth') or meta.get('auth') or []) or
                              re.search('发布|生产|部署', str(actions)))
            waiting = row['state'] in WAITING
            interval = 10 if production or row['state'] in ('stalled', 'heartbeat') else watch.get('intervalMinutes', 10)
            if row['state'] == 'parked' and not production:
                interval = 30
            hits = [] if waiting else watch.get('hits', [])
            facts = {
                'runId': run, 'state': row['state'], 'intervalMinutes': interval, 'hits': hits,
                'decision': None if waiting else watch.get('decision'),
                'lastProgressAt': watch.get('progressAt'), 'tokenUsage': watch.get('tokenUsage', 'unknown'),
                'activeMs': pid.get('activeMs'), 'waitMs': pid.get('waitMs'), 'pollCount': pid.get('pollCount'), 'wakeCount': pid.get('wakeCount'),
                'events': [] if waiting else watch.get('recent', [])[-12:],
            }
            if row['state'] == 'parked':
                facts.update(waitKind=yielded.get('until', '').split(':')[0],
                             deadlineAt=(yielded['at'] + yielded['timeoutMs']
                                         if 'at' in yielded and 'timeoutMs' in yielded else None),
                             waitOwner=yielded.get('owner', '本单'))
            try:
                brief_digest = hashlib.sha256(Path(brief_path).read_bytes()).hexdigest() if brief_path else None
            except FileNotFoundError:
                brief_digest = None
            evidence = hashlib.sha256(json.dumps(
                [facts['state'], facts['lastProgressAt'], hits, facts['decision'], facts.get('deadlineAt'),
                 brief_digest, row['progress'] if not watch and not waiting else None], sort_keys=True
            ).encode()).hexdigest()
            if facts['decision'] == '交主会话':
                key = f"{run}:{facts['lastProgressAt']}:{','.join(hits)}"
                store['event'](db, run, 'stall', '监督升级交主会话：' + '、'.join(hits), key)
            saved = db.execute('SELECT * FROM patrol WHERE run=?', (run,)).fetchone()
            same = saved is not None and saved['evidence'] == evidence
            same_interval = saved is not None and saved['due'] <= now + interval * 60
            due = saved['due'] if same_interval and saved['due'] > now else now + interval * 60
            review = (reviews or {}).get(run)
            reviewed = saved['reviewed'] if same else None
            verdict = saved['verdict'] if same else None
            input_tokens = saved['input_tokens'] if same else None
            if review and review.get('evidence') == evidence and not waiting:
                verdict = review['verdict']
                reviewed = now
                input_tokens = review.get('inputTokens')
            db.execute('INSERT OR REPLACE INTO patrol VALUES (?,?,?,?,?,?)',
                       (run, evidence, due, reviewed, verdict, input_tokens))
            facts.update(evidence=evidence, nextReviewAt=due, reviewRequired=not waiting and verdict is None,
                         reusedAt=reviewed, review=verdict, inputTokens=input_tokens)
            rows.append(facts)
    return {'rows': rows, 'reviewBatch': [row['runId'] for row in rows if row['reviewRequired']]}


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
    parser.add_argument('--patrol', action='store_true', help='输出全部在途任务及待复核批次（JSON）。')
    parser.add_argument('--record-reviews', action='store_true', help='从标准输入接收 runId 到 evidence、verdict、inputTokens 的 JSON 映射。')
    args = parser.parse_args()
    reviews = None
    if args.record_reviews:
        raw = json.load(sys.stdin)
        reviews = {}
        for run, review in raw.items():
            result = subprocess.run([str(FLEET / 'bin/redact')], input=review['verdict'],
                                    capture_output=True, text=True, check=True, timeout=5)
            reviews[run] = {**review, 'verdict': result.stdout.strip()}
    root = store['runs_root']()
    with closing(store['connect']()) as db:
        previous = None
        while True:
            started = time.monotonic()
            now = time.time()
            seats = reconcile(db, root, now)
            facts = patrol(db, root, now, reviews)
            if args.patrol or args.record_reviews:
                print(json.dumps(facts, ensure_ascii=False))
                return
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
