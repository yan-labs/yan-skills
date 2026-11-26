"""Share one status scan across fleet CLI processes."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

ACTIVE = {'running', 'queued', 'parked', 'waiting', 'abnormal'}


def status_rows(cli, fresh):
    root = Path.home() / '.agent-fleet'
    scope = Path(os.environ.get('AGENT_FLEET_RUNS_DIR') or root / 'runs').resolve()
    key = hashlib.sha256(os.fsencode(str(cli) + '\0' + str(scope))).hexdigest()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    cache = root / ('status-' + key + '.json')
    fd = os.open(cache.with_suffix('.lock'), os.O_CREAT | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if not fresh:
            try:
                if 0 <= time.time() - cache.stat().st_mtime < 15:
                    rows = json.loads(cache.read_bytes())
                    if isinstance(rows, list) and all(isinstance(row, dict) for row in rows):
                        return rows
            except (FileNotFoundError, ValueError):
                pass
        raw = subprocess.check_output(
            ['node', str(cli), 'status', '--json'], timeout=18, pass_fds=(lock.fileno(),)
        )
        rows = json.loads(raw)
        with tempfile.NamedTemporaryFile(dir=root, delete=False) as temp:
            try:
                temp.write(raw)
                temp.close()
                os.replace(temp.name, cache)
            finally:
                Path(temp.name).unlink(missing_ok=True)
        return rows


def main():
    args = sys.argv[1:]
    cli = Path(__file__).resolve().parent.parent / 'bin' / 'agent-fleet.mjs'
    rows = status_rows(cli, '--fresh' in args)
    if '--json' in args and set(args) <= {'--json', '--running', '--fresh'}:
        if '--running' in args:
            rows = [row for row in rows if row.get('state') in ACTIVE]
        print(json.dumps(rows, ensure_ascii=False, indent=2))
        return 0
    return subprocess.run(['node', str(cli), 'status-render', *args],
                          input=json.dumps(rows), text=True).returncode


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        sys.exit(f'fleet status: {error}')
