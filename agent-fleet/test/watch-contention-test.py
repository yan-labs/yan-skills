"""Run isolated mailbox requests against a dispatch loop (default: five minutes)."""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

fleet = Path(__file__).resolve().parents[1]
duration = float(os.environ.get('FLEET_CONTENTION_SECONDS', '300'))
with tempfile.TemporaryDirectory(prefix='fleet-contention-') as temp:
    env = {**os.environ, 'AGENT_FLEET_RUNS_DIR': temp, 'FLEET_WATCH_DIR': str(Path(temp) / 'watch')}
    watch = subprocess.Popen([sys.executable, str(fleet / 'bin/fleet-watch.py'), '--dispatch'],
                             env=env, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    deadline = time.monotonic() + duration
    def worker(index):
        count = 0
        while time.monotonic() < deadline:
            proc = subprocess.run([sys.executable, str(fleet / 'src/watch-store.py'), '--request'],
                                  input=json.dumps(['bind', {'run': f'load-{index}-{count}', 'seat': 'load'}]),
                                  capture_output=True, text=True, env=env, timeout=100)
            if proc.returncode:
                raise RuntimeError(f'request failed: {proc.stdout} {proc.stderr}')
            count += 1
        return count
    try:
        with ThreadPoolExecutor(max_workers=20) as pool:
            counts = list(pool.map(worker, range(20)))
        if watch.poll() is not None:
            raise RuntimeError('dispatch exited: ' + watch.stderr.read())
        print(f'PASS requests={sum(counts)} workers=20 seconds={duration} failures=0')
    finally:
        watch.terminate()
        watch.wait(timeout=10)
