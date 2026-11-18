#!/usr/bin/env python3
"""Claude SessionStart / UserPromptSubmit fleet seat pickup."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import runpy
import shlex
import sqlite3
import subprocess
import sys

FLEET = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(FLEET / 'src'))
store = runpy.run_path(str(FLEET / 'src/watch-store.py'))


def pickup(payload):
    if any(os.environ.get(key) for key in ('FLEET_SLOT_RUN_ID', 'FLEET_DETACHED_RUN_ID', 'FLEET_PARENT_RUN_ID')):
        return None
    session = payload['session_id']
    if payload.get('hook_event_name') == 'SessionStart' and os.environ.get('CLAUDE_ENV_FILE'):
        with open(os.environ['CLAUDE_ENV_FILE'], 'a') as env_file:
            env_file.write(shlex.join(['export', f'FLEET_DISPATCH_SESSION={session}']) + '\n')
    seat = store['current_seat'](payload['cwd'], session)
    if not seat:
        return None
    os.umask(0o077)
    root = Path(os.environ.get('FLEET_WATCH_CACHE', Path.home() / '.agent-fleet/watch/cache'))
    root.mkdir(parents=True, exist_ok=True)
    root.chmod(0o700)
    if root.parent == Path.home() / '.agent-fleet/watch':
        root.parent.chmod(0o700)
    key = hashlib.sha256(seat.encode()).hexdigest()
    start = root / hashlib.sha256(json.dumps([seat, session]).encode()).hexdigest()
    try:
        start.touch(exist_ok=False)
    except FileExistsError:
        pass
    seen = root / (key + '.synced')
    try:
        snap = store['request']('snapshot', dict(seat=seat, session=session, started=start.stat().st_mtime),
                                remote=store['remote_machine']())
    except (OSError, ValueError, subprocess.SubprocessError, sqlite3.Error):
        try:
            cached = datetime.fromtimestamp(seen.stat().st_mtime, timezone.utc).isoformat(timespec='seconds')
        except FileNotFoundError:
            cached = '无'
        return f'Fleet 席位 {seat} 未同步，缓存时间 {cached}。'
    seen.touch()
    lines = [f"Fleet 席位 {seat}：本席在跑 {snap['running']} 单、未读 {snap['unread']} 条。"]
    if not snap['current']:
        lines.append('本会话的指挥席已交接，当前会话仅可查看。')
    for entry in snap['events']:
        summary = ' '.join(entry['summary'].split())[:220]
        lines.append(f"[{entry['kind']}] {entry['run']} · {entry['id']} · {summary}")
        if snap['current']:
            lines.append(shlex.join(['fleet', 'watch', 'ack', entry['id'], '--session', session, '--seat', seat]))
    if snap['unread'] > len(snap['events']):
        lines.append('列表显示前 20 条，确认后会显示后续事件。')
    return '\n'.join(lines)


def main():
    try:
        payload = json.load(sys.stdin)
        message = pickup(payload)
        if message:
            print(json.dumps({'hookSpecificOutput': {'hookEventName': payload['hook_event_name'],
                                                    'additionalContext': message}}, ensure_ascii=False))
    except Exception:
        return


if __name__ == '__main__':
    main()
