import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

FLEET = Path(__file__).resolve().parents[1] / 'bin' / 'fleet'

with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    node = root / 'node'
    node.write_text("""#!/bin/sh
echo scan >> "$HOME/scans"
if [ -e "$HOME/fail" ]; then exit 4; fi
printf '%s\\n' '[{"runId":"a","state":"running"},{"runId":"b","state":"done"}]'
""")
    node.chmod(0o700)
    env = dict(os.environ, HOME=directory, PATH=directory + ':' + os.environ['PATH'],
               AGENT_FLEET_RUNS_DIR=str(root / 'runs'))

    def status(*args, **kwargs):
        return subprocess.run([str(FLEET), 'status', '--json', *args], env=env,
                              text=True, capture_output=True, **kwargs)

    def ids(rows):
        return [row['runId'] for row in json.loads(rows.stdout)]

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(lambda i: ids(status(*(['--running'] if i % 2 else []), check=True)),
                                range(8)))
    assert results == [['a', 'b'], ['a']] * 4
    scans = root / 'scans'
    assert scans.read_text().splitlines() == ['scan']
    cache, = (root / '.agent-fleet').glob('status-*.json')
    old = time.time() - 16
    os.utime(cache, (old, old))
    (root / 'fail').touch()
    assert status().returncode != 0
    assert abs(cache.stat().st_mtime - old) < 0.01
    (root / 'fail').unlink()
    assert ids(status(check=True)) == ['a', 'b']
    cache.write_text('{}')
    assert ids(status(check=True)) == ['a', 'b']
    assert ids(status('--fresh', check=True)) == ['a', 'b']
    assert scans.read_text().splitlines() == ['scan'] * 5

print('status cache: concurrent running/all, expiry, failed refresh, corrupt cache, and fresh reads OK')
