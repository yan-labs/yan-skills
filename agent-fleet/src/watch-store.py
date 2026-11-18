"""Mini fleet mailbox. All writes and generation checks run in SQLite transactions."""
import argparse
from contextlib import closing
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import sqlite3
import subprocess
import sys
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
    db.row_factory = sqlite3.Row
    db.execute('PRAGMA journal_mode=WAL')
    db.executescript(SCHEMA)
    migrate(db)
    return db


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


def run_binding(state):
    brief = state.get('briefPath')
    metadata = read_record(Path(brief).with_suffix('.json')) if brief else {}
    # sessionId belongs to the executor, so it cannot establish dispatch ownership.
    return dict(cwd=state.get('cwd'), parent=state.get('parentRunId'),
                repo=(state.get('object') or metadata.get('object') or {}).get('repo'),
                seat=state.get('watchSeat'),
                line=state.get('watchLine') or state.get('dispatchSession') or metadata.get('dispatch_session'))


def terminal_summary(state, verdict):
    return f'{verdict}/{state}' if verdict else state


def migrate(db):
    if db.execute('PRAGMA user_version').fetchone()[0]:
        return
    with db:
        db.execute('BEGIN IMMEDIATE')
        if db.execute('PRAGMA user_version').fetchone()[0]:
            return
        root = runs_root()

        def owner(run, seen):
            if not run or run in seen or not re.fullmatch(r'[\w.-]+', run, re.ASCII):
                return None
            row = db.execute('SELECT seat FROM runs WHERE id=?', (run,)).fetchone()
            if row and '#' in row['seat']:
                return row['seat']
            state = read_record(root / (run + '.json')) or read_record(root / (run + '.queue.json'))
            binding = run_binding(state)
            inherited = owner(binding['parent'], {*seen, run})
            if inherited:
                return inherited
            base = row['seat'] if row else seat_for(binding['cwd']) or seat_for(binding['repo'])
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
        db.execute('PRAGMA user_version=1')


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
    if not owner and parent and parent not in (*ancestors, run) and re.fullmatch(r'[\w.-]+', parent, re.ASCII):
        state = read_record(runs_root() / (parent + '.json'))
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


def snapshot(db, seat, session=None, started=None):
    if session and started is not None and db.execute('INSERT OR IGNORE INTO sessions VALUES (?,?)', (seat, session)).rowcount:
        db.execute('''INSERT INTO seats VALUES (?,?,?) ON CONFLICT(id) DO UPDATE
                      SET session=excluded.session, started=excluded.started
                      WHERE excluded.started >= seats.started''', (seat, session, started))
    owner = db.execute('SELECT session FROM seats WHERE id=?', (seat,)).fetchone()
    slots = ','.join('?' * len(ACTIVE))
    running = db.execute(f'SELECT COUNT(*) FROM runs WHERE seat=? AND state IN ({slots})',
                         (seat, *ACTIVE)).fetchone()[0]
    unread = db.execute('SELECT COUNT(*) FROM events WHERE seat=? AND acked_by IS NULL', (seat,)).fetchone()[0]
    rows = db.execute('''SELECT id,run,kind,summary,at FROM events
                         WHERE seat=? AND acked_by IS NULL ORDER BY at,id LIMIT 20''', (seat,))
    return dict(seat=seat, running=running, unread=unread, events=[dict(row) for row in rows],
                current=bool(owner and owner['session'] == session), at=now_iso())


def acknowledge(db, event_id, session, seat):
    row = db.execute('''SELECT a.session FROM events e JOIN seats a ON e.seat=a.id WHERE e.id=? AND e.seat=?''',
                     (event_id, seat)).fetchone()
    if not row or row['session'] != session:
        raise ValueError('只有当前席位代可确认此事件')
    db.execute('UPDATE events SET acked_by=? WHERE id=? AND acked_by IS NULL', (session, event_id))
    return {'acked': event_id}


def request(action, data, remote=False):
    if remote:
        proc = subprocess.run(['ssh', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=4', 'mac-mini',
                               'PATH=/opt/homebrew/bin:/usr/local/bin:$PATH fleet watch --serve'],
                              input=json.dumps([action, data]), text=True, capture_output=True, timeout=12)
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
        if action == 'claim':
            return bool(db.execute('UPDATE runs SET timer_claimed=1 WHERE id=? AND timer_claimed=0',
                                   (data['run'],)).rowcount)
        raise ValueError('未知 watch 操作')


def remote_machine():
    return not (mini.on_mini() or os.environ.get('FLEET_MACHINE') == 'mini'
                or os.environ.get('AGENT_FLEET_RUNS_DIR') or os.environ.get('FLEET_WATCH_DIR'))


def main():
    parser = argparse.ArgumentParser(prog='fleet watch')
    parser.add_argument('--serve', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--request', action='store_true', help=argparse.SUPPRESS)
    sub = parser.add_subparsers(dest='command')
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
