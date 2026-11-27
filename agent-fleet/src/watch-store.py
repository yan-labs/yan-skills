"""Mini fleet mailbox. All writes and generation checks run in SQLite transactions."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import random
import sqlite3
import subprocess
import sys
import time
from urllib.parse import urlsplit

import mini

FLEET = Path(__file__).resolve().parents[1]
ACTIVE = ('starting', 'queued', 'running', 'parked', 'waiting', 'stalled', 'heartbeat')
TERMINAL = ('done', 'failed', 'stopped', 'blocked')
SCHEMA = """
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY, seat TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'starting',
  transition INTEGER NOT NULL DEFAULT 0, changed REAL NOT NULL DEFAULT (strftime('%s','now')),
  timer_claimed INTEGER NOT NULL DEFAULT 0,
  progress TEXT, progressed REAL
);
CREATE INDEX IF NOT EXISTS runs_seat ON runs(seat);
CREATE TABLE IF NOT EXISTS seats (id TEXT PRIMARY KEY, session TEXT NOT NULL, started REAL NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  seat TEXT NOT NULL, id TEXT NOT NULL, PRIMARY KEY(seat,id)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, seat TEXT NOT NULL, run TEXT NOT NULL, kind TEXT NOT NULL,
  summary TEXT NOT NULL, at TEXT NOT NULL, acked_by TEXT
);
CREATE INDEX IF NOT EXISTS events_unread ON events(seat) WHERE acked_by IS NULL;
CREATE TABLE IF NOT EXISTS wait_terminals (run TEXT PRIMARY KEY);
CREATE TABLE IF NOT EXISTS timers (
  id TEXT PRIMARY KEY, seat TEXT NOT NULL, rule TEXT NOT NULL, timezone TEXT NOT NULL,
  action TEXT NOT NULL, due REAL
);
"""


def connect():
    root = Path(os.environ.get('FLEET_WATCH_DIR') or
                (Path(os.environ['AGENT_FLEET_RUNS_DIR']) / '.watch'
                 if os.environ.get('AGENT_FLEET_RUNS_DIR') else Path.home() / '.agent-fleet/watch'))
    os.umask(0o077)
    root.mkdir(parents=True, exist_ok=True)
    root.chmod(0o700)
    db = sqlite3.connect(root / 'mailbox.sqlite3', timeout=10)
    db.execute('PRAGMA busy_timeout=10000')
    try:
        db.row_factory = sqlite3.Row
        db.execute('PRAGMA journal_mode=WAL')
        db.executescript(SCHEMA)
        migrate(db)
        return db
    except BaseException:
        db.close()
        raise


def seat_for(cwd):
    if not cwd:
        return None
    try:
        common = subprocess.check_output(
            ['git', '-C', cwd, 'rev-parse', '--path-format=absolute', '--git-common-dir'],
            text=True, stderr=subprocess.DEVNULL, timeout=3).strip()
    except (OSError, subprocess.SubprocessError):
        return None
    path = Path(common).resolve()
    try:
        origin = subprocess.check_output(
            ['git', '--git-dir', str(path), 'config', '--local', '--get', 'remote.origin.url'],
            text=True, stderr=subprocess.DEVNULL, timeout=3).strip()
    except (OSError, subprocess.SubprocessError):
        origin = ''
    if '://' in origin:
        url = urlsplit(origin)
        host, repo = url.hostname, url.path
    else:
        match = re.fullmatch(r'(?:[^@/]+@)?([\w.-]+):([^?#]+)', origin)
        host, repo = match.groups() if match else (None, '')
    if host and re.fullmatch(r'/[\w.-]+(?:/[\w.-]+)+', '/' + repo.strip('/')):
        return host.lower() + '/' + repo.strip('/').removesuffix('.git')

    for home in (Path.home().resolve(), Path(mini.LOCAL_HOME), Path(mini.REMOTE_HOME)):
        if home.is_absolute() and path.is_relative_to(home):
            parts = path.relative_to(home).parts
            if parts and parts[0].lower() == 'project':
                parts = ('project', *parts[1:])
            return '~/' + '/'.join(parts)
    return str(path)


def dispatch_session():
    return os.environ.get('FLEET_DISPATCH_SESSION') or os.environ.get('CODEX_THREAD_ID')


def line_seat(repo, line):
    return f'{repo}#{line}' if line else repo


def current_seat(cwd, session=None, repo=None):
    line = os.environ.get('FLEET_LINE')
    if not line and os.environ.get('FLEET_SEAT'):
        return os.environ['FLEET_SEAT']
    base = seat_for(cwd) or seat_for(repo)
    return line_seat(base, line or session or dispatch_session()) if base else None


def brief_metadata(brief):
    if not brief:
        return {}
    metadata = read_record(Path(brief).with_suffix('.json'))
    return metadata if isinstance(metadata, dict) else {}


def run_binding(state):
    metadata = brief_metadata(state.get('briefPath'))
    # sessionId belongs to the executor, so it cannot establish dispatch ownership.
    return dict(cwd=state.get('cwd'), parent=state.get('parentRunId'),
                repo=(state.get('object') or metadata.get('object') or {}).get('repo'),
                seat=state.get('watchSeat') or metadata.get('watch_seat'),
                line=state.get('watchLine') or state.get('dispatchSession') or metadata.get('dispatch_session'))


def terminal_summary(state, verdict):
    return f'{verdict}/{state}' if verdict else state


def migrate(db):
    if db.execute('PRAGMA user_version').fetchone()[0] >= 2:
        return
    with db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute('PRAGMA user_version').fetchone()[0] >= 2:
            return
        root = runs_root()

        def owner(run, seen):
            if not run or run in seen or run in ('.', '..') or not re.fullmatch(r'[\w.-]+', run, re.ASCII):
                return None
            row = db.execute('SELECT seat FROM runs WHERE id=?', (run,)).fetchone()
            if row and '#' in row['seat']:
                return row['seat']
            state = read_record(root / (run + '.json')) or read_record(root / (run + '.queue.json'))
            binding = run_binding(state)
            inherited = owner(binding['parent'], {*seen, run})
            if inherited:
                return inherited
            if binding['seat'] and '#' in binding['seat']:
                return binding['seat']
            base = (seat_for(binding['cwd']) or seat_for(binding['repo'])
                    or (row['seat'] if row else None))
            return line_seat(base, binding['line']) if base and binding['line'] else None

        for row in db.execute('SELECT id,seat,state FROM runs').fetchall():
            run = row['id']
            seat = owner(run, set())
            if seat and seat != row['seat']:
                db.execute('UPDATE runs SET seat=? WHERE id=?', (seat, run))
                db.execute('UPDATE events SET seat=? WHERE run=? AND acked_by IS NULL', (seat, run))
            if row['state'] in TERMINAL:
                verdict = read_record(root / (run + '.json')).get('verdict')
                if verdict:
                    db.execute("""UPDATE events SET summary=? WHERE run=? AND kind='terminal'
                                  AND acked_by IS NULL AND summary=?""",
                               (terminal_summary(row['state'], verdict), run, row['state']))
        db.execute('PRAGMA user_version=2')


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def runs_root():
    return Path(os.environ.get('AGENT_FLEET_RUNS_DIR', Path.home() / '.agent-fleet/runs'))


def read_record(path):
    try:
        return json.loads(path.read_text())
    except (FileNotFoundError, ValueError):
        return {}


def bind(db, run, seat=None, cwd=None, parent=None, repo=None, line=None, ancestors=()):
    if not re.fullmatch(r'[\w.-]+', run, re.ASCII) or run in ('.', '..'):
        raise ValueError('无效 runId')
    current = db.execute('SELECT seat FROM runs WHERE id=?', (run,)).fetchone()
    if current:
        return current['seat']
    inherited = db.execute('SELECT seat FROM runs WHERE id=?', (parent,)).fetchone()
    owner = inherited['seat'] if inherited else None
    if not owner and parent and parent not in (*ancestors, run, '.', '..') and re.fullmatch(r'[\w.-]+', parent, re.ASCII):
        state = (read_record(runs_root() / (parent + '.json'))
                 or read_record(runs_root() / (parent + '.queue.json')))
        if state.get('runId') == parent:
            owner = bind(db, parent, **run_binding(state), ancestors=(*ancestors, run))
    owner = owner or seat or line_seat(seat_for(cwd) or seat_for(repo) or 'unassigned', line)
    db.execute('INSERT INTO runs(id,seat) VALUES (?,?)', (run, owner))
    return owner


def event(db, run, kind, summary, key, at=None):
    db.execute('''INSERT OR IGNORE INTO events(id,seat,run,kind,summary,at)
                  SELECT ?,seat,id,?,?,? FROM runs WHERE id=?''',
               (key, kind, summary, at or now_iso(), run))


def record_ask(db, ask):
    if not db.execute('SELECT 1 FROM runs WHERE id=?', (ask['runId'],)).fetchone():
        raise ValueError('ask 缺少 runId 席位登记')
    event(db, ask['runId'], 'ask', ask['kind'] + '：' + ask['text'], ask['id'], ask['at'])


def legacy_asks(db, root, run):
    seen = read_record(root / (run + '.asks-seen'))
    seen = {key for key in seen if isinstance(key, str)} if isinstance(seen, list) else set()
    db.executemany("UPDATE events SET acked_by='legacy-wait' WHERE id=? AND run=? AND kind='ask' AND acked_by IS NULL",
                   ((key, run) for key in seen))
    path = root / (run + '.asks')
    try:
        with path.open() as log:
            for line in log:
                try:
                    ask = json.loads(line)
                except ValueError:
                    continue
                if (not isinstance(ask, dict) or ask.get('runId') != run
                        or not all(isinstance(ask.get(key), str) for key in ('id', 'kind', 'text', 'at'))
                        or db.execute('SELECT 1 FROM events WHERE id=?', (ask['id'],)).fetchone()):
                    continue
                result = subprocess.run([str(FLEET / 'bin/redact')], input=ask['text'],
                                        capture_output=True, text=True, check=True, timeout=5)
                record_ask(db, {**ask, 'text': result.stdout.strip()})
                if ask['id'] in seen:
                    db.execute("UPDATE events SET acked_by='legacy-wait' WHERE id=?", (ask['id'],))
    except FileNotFoundError:
        pass


def take_wait_events(db, run, terminal=False):
    if not re.fullmatch(r'[\w.-]+', run, re.ASCII) or run in ('.', '..'):
        raise ValueError('无效 runId')
    root = runs_root()
    state = read_record(root / (run + '.json'))
    if not state.get('detach') or state.get('runId') != run:
        return []
    bind(db, run, **run_binding(state))
    legacy_asks(db, root, run)
    rows = db.execute("""SELECT id,summary FROM events WHERE run=? AND kind='ask'
                         AND acked_by IS NULL ORDER BY at,id""", (run,)).fetchall()
    db.executemany("UPDATE events SET acked_by='wait' WHERE id=?", ((row['id'],) for row in rows))
    if terminal and state.get('status') in TERMINAL:
        db.execute('INSERT OR IGNORE INTO wait_terminals VALUES (?)', (run,))
        db.execute("""UPDATE events SET acked_by='wait' WHERE run=? AND kind='terminal'
                      AND acked_by IS NULL""", (run,))
    return [row['summary'] for row in rows]


def snapshot(db, seat, session=None, started=None):
    if session and started is not None and db.execute('INSERT OR IGNORE INTO sessions VALUES (?,?)', (seat, session)).rowcount:
        db.execute('''INSERT INTO seats VALUES (?,?,?) ON CONFLICT(id) DO UPDATE
                      SET session=excluded.session, started=excluded.started
                      WHERE excluded.started >= seats.started''', (seat, session, started))
    owner = db.execute('SELECT session FROM seats WHERE id=?', (seat,)).fetchone()
    slots = ','.join('?' * len(ACTIVE))
    active = [dict(row) for row in db.execute(
        f'SELECT id,state FROM runs WHERE seat=? AND state IN ({slots}) ORDER BY id', (seat, *ACTIVE))]
    unread = db.execute('SELECT COUNT(*) FROM events WHERE seat=? AND acked_by IS NULL', (seat,)).fetchone()[0]
    rows = db.execute('''SELECT id,run,kind,summary,at FROM events
                         WHERE seat=? AND acked_by IS NULL ORDER BY at,id LIMIT 20''', (seat,))
    return dict(seat=seat, running=len(active), runs=active, unread=unread, events=[dict(row) for row in rows],
                current=bool(owner and owner['session'] == session), at=now_iso())


def acknowledge(db, event_id, session, seat):
    row = db.execute('''SELECT a.session FROM events e JOIN seats a ON e.seat=a.id WHERE e.id=? AND e.seat=?''',
                     (event_id, seat)).fetchone()
    if not row or row['session'] != session:
        raise ValueError('只有当前席位代可确认此事件')
    db.execute('UPDATE events SET acked_by=? WHERE id=? AND acked_by IS NULL', (session, event_id))
    return {'acked': event_id}


def request_once(action, data, remote=False):
    if remote:
        proc = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=4', 'mac-mini',
                               'PATH=/opt/homebrew/bin:/usr/local/bin:$PATH fleet watch --serve'],
                              input=json.dumps([action, data]), text=True, capture_output=True, timeout=90)
        if proc.returncode:
            raise ValueError('Mini 信箱未响应' if not proc.stdout else json.loads(proc.stdout)['error'])
        return json.loads(proc.stdout)
    with closing(connect()) as db, db:
        # Serialize read/modify/write across hooks, watcher and fleet workers.
        db.execute('BEGIN IMMEDIATE')
        if action == 'snapshot':
            return snapshot(db, **data)
        if action == 'ack':
            return acknowledge(db, **data)
        if action == 'bind':
            return bind(db, **data)
        if action == 'ask':
            extra = data.pop('binding')
            bind(db, data['runId'], **extra)
            return record_ask(db, data)
        if action == 'wait-events':
            return take_wait_events(db, **data)
        if action == 'claim':
            return bool(db.execute('UPDATE runs SET timer_claimed=1 WHERE id=? AND timer_claimed=0',
                                   (data['run'],)).rowcount)
        raise ValueError('未知 watch 操作')


def request(action, data, remote=False):
    # Retry whole transactions only after SQLite has rolled them back.
    deadline = time.monotonic() + 65
    while True:
        try:
            return request_once(action, dict(data), remote=remote)
        except sqlite3.OperationalError as error:
            code = getattr(error, 'sqlite_errorcode', None)
            if code is not None:
                retryable = (code & 0xff) in (sqlite3.SQLITE_BUSY, sqlite3.SQLITE_LOCKED)
            else:
                retryable = any(word in str(error).lower() for word in ('locked', 'busy'))
            remaining = deadline - time.monotonic()
            if not retryable or remaining <= 0:
                raise
            time.sleep(min(remaining, random.uniform(0.05, 0.25)))


def remote_machine():
    return not (mini.on_mini() or os.environ.get('FLEET_MACHINE') == 'mini'
                or os.environ.get('AGENT_FLEET_RUNS_DIR') or os.environ.get('FLEET_WATCH_DIR'))


def main():
    parser = argparse.ArgumentParser(prog='fleet watch')
    parser.add_argument('--serve', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--request', action='store_true', help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest='command')
    listen = sub.add_parser('listen', help='输出席位未读变化，供会话 Monitor 唤醒。')
    listen.add_argument('--seat')
    listen.add_argument('--session', help='席位已交接时退出。')
    listen.add_argument('--once', action='store_true')
    status = sub.add_parser('status')
    status.add_argument('--seat', default=os.environ.get('FLEET_SEAT'))
    ack = sub.add_parser('ack')
    ack.add_argument('event_id')
    ack.add_argument('--session', required=True)
    ack.add_argument('--seat')
    args = parser.parse_args()
    try:
        if args.serve or args.request:
            action, data = json.load(sys.stdin)
            result = request(action, data, remote=args.request and remote_machine())
        elif args.command == 'listen':
            seat = args.seat or current_seat(os.getcwd(), args.session)
            if not seat:
                raise ValueError('当前目录无法解析席位，请指定 --seat')
            remote = remote_machine()
            announced = set()
            previous_unread = 0
            while True:
                try:
                    snap = request('snapshot', {'seat': seat, 'session': args.session}, remote=remote)
                    if args.session and not snap['current']:
                        return 0
                    visible = {entry['id'] for entry in snap['events']}
                    if visible - announced or snap['unread'] > previous_unread:
                        print(json.dumps({'seat': seat, 'unread': snap['unread']}, ensure_ascii=False), flush=True)
                    announced = visible
                    previous_unread = snap['unread']
                except (OSError, ValueError, sqlite3.Error, subprocess.SubprocessError):
                    if args.once:
                        raise
                if args.once:
                    return 0
                time.sleep(15)
        elif args.command == 'status':
            seat = args.seat or current_seat(os.getcwd())
            if not seat:
                raise ValueError('当前目录无法解析席位，请指定 --seat')
            result = request('snapshot', {'seat': seat}, remote=remote_machine())
        elif args.command == 'ack':
            result = request('ack', dict(event_id=args.event_id, session=args.session,
                                         seat=args.seat or current_seat(os.getcwd(), args.session)), remote=remote_machine())
        else:
            parser.error('需要 status 或 ack')
        print(json.dumps(result, ensure_ascii=False))
    except (OSError, ValueError, sqlite3.Error, subprocess.SubprocessError) as error:
        print(json.dumps({'error': str(error)}, ensure_ascii=False))
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
