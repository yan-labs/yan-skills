import contextlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'src/host-lock.py'
spec = importlib.util.spec_from_file_location('host_lock', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)

class ElasticHeavyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = patch.object(mod, 'ROOT', Path(self.tmp.name))
        self.root.start()
    def tearDown(self):
        self.root.stop()
        self.tmp.cleanup()
    def test_more_than_three_at_low_load(self):
        leases = [mod.try_lease('heavy-%d' % i) for i in range(1, 4)]
        try:
            with patch.dict(os.environ, {}, clear=True), patch.object(mod, 'capacity_state', return_value=True), patch.object(mod, 'exec_with_lease', side_effect=RuntimeError('executed')) as run, contextlib.redirect_stderr(io.StringIO()):
                with self.assertRaisesRegex(RuntimeError, 'executed'):
                    mod.heavy(['--', 'true'])
                self.assertEqual(mod.active_leases(), [1, 2, 3, 4])
                os.close(run.call_args.args[0])
        finally:
            for fd in leases: os.close(fd)
    def test_overload_routes_gcp_without_local_execution(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(mod, 'capacity_state', return_value=False), patch.object(mod, 'overflow_to_gcpx', side_effect=RuntimeError('remote')) as remote, patch.object(mod, 'exec_with_lease') as local:
            with self.assertRaisesRegex(RuntimeError, 'remote'): mod.heavy(['--gcp', '--', 'true'])
            remote.assert_called_once_with(['true'])
            local.assert_not_called()
    def test_missing_metrics_only_one(self):
        fd = mod.try_lease('heavy-1')
        try:
            with patch.dict(os.environ, {}, clear=True), patch.object(mod, 'capacity_state', return_value=None), patch.object(mod, 'overflow_to_gcpx', return_value=False), contextlib.redirect_stderr(io.StringIO()):
                self.assertEqual(mod.heavy(['--gcp','--','true']), 75)
        finally: os.close(fd)
        with patch.dict(os.environ, {}, clear=True), patch.object(mod, 'capacity_state', return_value=None), patch.object(mod, 'exec_with_lease', side_effect=RuntimeError('one')) as run, contextlib.redirect_stderr(io.StringIO()):
            with self.assertRaisesRegex(RuntimeError, 'one'): mod.heavy(['--','true'])
            os.close(run.call_args.args[0])
    def test_fifo_and_stale_ticket(self):
        with mod.allocation_guard():
            first, fd1 = mod.queue_ticket()
            second, fd2 = mod.queue_ticket()
            self.assertTrue(mod.queue_head(first))
            self.assertFalse(mod.queue_head(second))
            os.close(fd1)
            self.assertTrue(mod.queue_head(second))
            self.assertFalse(first.exists())
            os.close(fd2)
    def test_sampled_capacity_and_counter_reset(self):
        import json
        history = mod.ROOT / 'heavy-paging-sample.json'
        history.write_text(json.dumps([[1000, 100]]))
        def output(cmd, **kwargs):
            if cmd[0] == 'sysctl': return '1'
            if cmd[0] == 'top': return 'CPU usage: 10% user, 10% sys, 80% idle'
            return 'Pageouts: 80.\nSwapouts: 80.\n'
        with patch.object(mod.sys, 'platform', 'darwin'), patch.object(mod.time, 'time', return_value=1060), patch.object(mod.subprocess, 'check_output', side_effect=output):
            self.assertTrue(mod.capacity_state())
        history.write_text(json.dumps([[1000, 999]]))
        with patch.object(mod.sys, 'platform', 'darwin'), patch.object(mod.time, 'time', return_value=1060), patch.object(mod.subprocess, 'check_output', side_effect=output):
            self.assertIsNone(mod.capacity_state())

    def test_overload_with_missing_paging(self):
        def output(cmd, **kwargs):
            if cmd[0] == 'sysctl': return '1'
            if cmd[0] == 'top': return 'CPU usage: 90% user, 5% sys, 5% idle'
            raise OSError('vm_stat unavailable')
        with patch.object(mod.sys, 'platform', 'darwin'), patch.object(mod.subprocess, 'check_output', side_effect=output):
            self.assertFalse(mod.capacity_state())

    def test_capacity_metrics(self):
        for cpu, pressure, paging, expected in [
            (30, 1, 0, True), (84, 1, 99, True), (85, 1, 0, False),
            (70, 2, 0, False), (69, 2, 25, False), (69, 2, 24, True),
            (0, 4, 0, False), (0, 3, 0, None), (None, 1, 0, None),
            (0, 1, None, None), (90, 1, None, False),
            (None, 2, 25, False),
        ]:
            with self.subTest(cpu=cpu, pressure=pressure, paging=paging):
                self.assertEqual(mod.capacity_decision(cpu, pressure, paging), expected)

if __name__ == '__main__': unittest.main()
