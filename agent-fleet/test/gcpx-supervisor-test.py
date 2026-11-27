import io
import runpy
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
    def test_relative_path_does_not_crash_watcher(self):
        with patch('subprocess.Popen') as spawn, redirect_stderr(io.StringIO()):
            supervisor = Supervisor('relative.json')
            supervisor.tick(100)
            self.assertIsNone(supervisor.config)
            spawn.assert_not_called()

if __name__ == '__main__': unittest.main()
