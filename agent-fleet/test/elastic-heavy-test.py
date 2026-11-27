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
    def test_metrics_thresholds(self):
        def run(cmd, **kw):
            return '1' if 'kern.memorystatus_vm_pressure_level' in cmd else 'total = 4096M used = 1000M free = 3096M'
        with patch.object(mod.sys, 'platform', 'darwin'), patch.object(mod.os, 'cpu_count', return_value=10), patch.object(mod.os, 'getloadavg', return_value=(14, 0, 0)), patch.object(mod.subprocess, 'check_output', side_effect=run):
            self.assertTrue(mod.capacity_state())
            with patch.object(mod.os, 'getloadavg', return_value=(15, 0, 0)):
                self.assertFalse(mod.capacity_state())
            with patch.object(mod.subprocess, 'check_output', side_effect=OSError()):
                self.assertIsNone(mod.capacity_state())

if __name__ == '__main__': unittest.main()
