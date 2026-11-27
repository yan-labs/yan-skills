import io
import runpy
import subprocess
import sys
import tempfile
import unittest
from contextlib import redirect_stderr
from pathlib import Path
from unittest.mock import patch

watch = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'bin/fleet-watch.py'))
Supervisor = watch['GcpxIdleSupervisor']

class SupervisorTests(unittest.TestCase):
    def test_opt_in_and_no_duplicate_child(self):
        with patch('subprocess.Popen') as spawn:
            Supervisor(None).tick(100)
            spawn.assert_not_called()
            supervisor = Supervisor('/tmp/gcpx-test.json')
            spawn.return_value.poll.return_value = None
            supervisor.tick(100)
            supervisor.tick(200)
            self.assertEqual(spawn.call_count, 1)
            self.assertEqual(spawn.call_args.args[0][-1], 'reconcile')
            spawn.return_value.poll.return_value = 0
            supervisor.tick(200)
            self.assertEqual(spawn.call_count, 2)
    def test_reconcile_failure_logged_by_supervisor(self):
        stderr = io.StringIO()
        with patch('subprocess.Popen') as spawn, redirect_stderr(stderr):
            supervisor = Supervisor('/tmp/gcpx-test.json')
            supervisor.tick(100)
            spawn.return_value.poll.return_value = 1
            supervisor.tick(101)
        self.assertIn('gcpx idle reconciliation exited 1', stderr.getvalue())
    def test_worker_status_is_inherited_by_watch_log(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'bin').mkdir()
            executable = root / 'bin' / 'gcpx'
            executable.write_text("#!/bin/sh\nfor i in $(seq 1 60); do echo line-$i; done\necho '{\"worker-a\":\"creation recovery failed\"}'\nexit 1\n")
            executable.chmod(0o755)
            code = """import runpy,sys
from pathlib import Path
n = runpy.run_path(sys.argv[1])
cls = n['GcpxIdleSupervisor']
cls.tick.__globals__['FLEET'] = Path(sys.argv[2])
s = cls('/tmp/gcpx-test.json')
s.tick(100)
s.child.wait(timeout=10)
s.tick(101)
"""
            result = subprocess.run([sys.executable, '-c', code, str(Path(__file__).resolve().parents[1] / 'bin/fleet-watch.py'), str(root)], capture_output=True, text=True, timeout=15, check=True)
            self.assertIn('"worker-a":"creation recovery failed"', result.stdout)
            self.assertNotIn('line-11\n', result.stdout)
            self.assertIn('line-12\n', result.stdout)
            self.assertEqual(len(result.stdout.splitlines()), 50)
            self.assertIn('gcpx idle reconciliation exited 1', result.stderr)
    def test_relative_path_does_not_crash_watcher(self):
        with patch('subprocess.Popen') as spawn, redirect_stderr(io.StringIO()):
            supervisor = Supervisor('relative.json')
            supervisor.tick(100)
            self.assertIsNone(supervisor.config)
            spawn.assert_not_called()

if __name__ == '__main__': unittest.main()
