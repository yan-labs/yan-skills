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
case " $* " in *' --running ') printf '%s\\n' '[{"runId":"a","state":"running"}]';; *) printf '%s\\n' '[{"runId":"a","state":"running"},{"runId":"b","state":"done"}]';; esac
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
    assert scans.read_text().splitlines() == ['scan'] * 2
    caches = list((root / '.agent-fleet').glob('status-*.json'))
    assert len(caches) == 2
    cache = next(path for path in caches if len(json.loads(path.read_text())) == 2)
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
    assert scans.read_text().splitlines() == ['scan'] * 6

# 派单判重只查同名：--name/--brief-path 原样交给扫描进程，缓存与全量分开；扫描超时给出可调的环境变量。
with tempfile.TemporaryDirectory() as directory:
    root = Path(directory)
    node = root / 'node'
    node.write_text("""#!/bin/sh
echo "$*" >> "$HOME/node-args"
if [ -n "$SLOW" ]; then sleep 3; fi
case " $* " in *' --name hit '*) printf '%s\\n' '[{"runId":"h","name":"hit","state":"running"}]';; *) printf '%s\\n' '[{"runId":"h","name":"hit","state":"running"},{"runId":"o","name":"other","state":"done"}]';; esac
""")
    node.chmod(0o700)
    env = dict(os.environ, HOME=directory, PATH=directory + ':' + os.environ['PATH'],
               AGENT_FLEET_RUNS_DIR=str(root / 'runs'))

    def status(*args, **kwargs):
        return subprocess.run([str(FLEET), 'status', '--json', *args], env={**env, **kwargs.pop('extra_env', {})},
                              text=True, capture_output=True, **kwargs)

    scoped = status('--fresh', '--name', 'hit', '--brief-path', '/x/hit.brief.md', check=True)
    assert [row['runId'] for row in json.loads(scoped.stdout)] == ['h']
    assert (root / 'node-args').read_text().splitlines()[0].endswith(' status --json --name hit --brief-path /x/hit.brief.md')
    assert [row['runId'] for row in json.loads(status('--fresh', check=True).stdout)] == ['h', 'o']
    assert len(list((root / '.agent-fleet').glob('status-*.json'))) == 2
    slow = status('--fresh', '--name', 'hit', extra_env={'SLOW': '1', 'FLEET_STATUS_TIMEOUT_SECONDS': '0.5'})
    assert slow.returncode != 0 and 'FLEET_STATUS_TIMEOUT_SECONDS' in slow.stderr and '0.5 秒' in slow.stderr, slow.stderr

print('status cache: concurrent running/all, expiry, failed refresh, corrupt cache, fresh reads, name scope, and timeout hint OK')
