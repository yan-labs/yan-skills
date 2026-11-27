import contextlib
import importlib.util
import io
import os
import sys
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'src/host-lock.py'
spec = importlib.util.spec_from_file_location('fleet_host_lock', path)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
remote_spec = importlib.util.spec_from_file_location('gcpx_remote_fleet', path.parent / 'gcpx_remote_fleet.py')
remote = importlib.util.module_from_spec(remote_spec)
remote_spec.loader.exec_module(remote)

class OverflowTests(unittest.TestCase):
    def test_remote_heavy_executes_directly_on_worker(self):
        for option in ([], ['--gcp']):
            with self.subTest(option=option), patch.object(sys, 'argv', ['fleet', 'heavy', *option, '--', 'printf', '%s', '$(literal)']), patch.object(remote.os, 'execvp', side_effect=RuntimeError('intercepted')) as run:
                with self.assertRaisesRegex(RuntimeError, 'intercepted'): remote.main()
                run.assert_called_once_with('printf', ['printf', '%s', '$(literal)'])
        with patch.object(sys, 'argv', ['fleet', 'heavy', '--gcp', '--']), patch.object(remote.os, 'execvp') as run:
            with self.assertRaisesRegex(ValueError, 'usage'): remote.main()
            run.assert_not_called()
    def test_full_capacity_routes_mapped_cwd_without_shell_interpolation(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('GCPX_TEST_TMPDIR')) as root:
            (Path(root) / 'nested').mkdir()
            env = {'FLEET_GCP_WORKSPACE_EXPERIMENTAL':'1', 'FLEET_HEAVY_CAPACITY':'1',
                   'FLEET_GCPX_WORKSPACE':'task', 'FLEET_GCPX_CONFIG':'/tmp/config.json', 'FLEET_GCPX_MIRROR':root}
            previous = os.getcwd()
            try:
                os.chdir(Path(root) / 'nested')
                with patch.dict(os.environ, env, clear=True), patch.object(mod, 'try_lease', return_value=None), patch.object(mod.os, 'execv', side_effect=RuntimeError('intercepted')) as run, contextlib.redirect_stderr(io.StringIO()):
                    with self.assertRaisesRegex(RuntimeError, 'intercepted'): mod.heavy(['--','printf','%s','$(unsafe)'])
                    argv = run.call_args.args[1]
                    self.assertEqual(argv[-4:], ['nested', 'printf', '%s', '$(unsafe)'])
                    self.assertIn('|| exit', argv[-6])
            finally: os.chdir(previous)
    def test_outside_mapping_never_executes_or_falls_back(self):
        with tempfile.TemporaryDirectory(dir=os.environ.get('GCPX_TEST_TMPDIR')) as root:
            env={'FLEET_GCP_WORKSPACE_EXPERIMENTAL':'1', 'FLEET_HEAVY_CAPACITY':'1', 'FLEET_GCPX_WORKSPACE':'task', 'FLEET_GCPX_CONFIG':'/tmp/config.json','FLEET_GCPX_MIRROR':root}
            with patch.dict(os.environ, env, clear=True), patch.object(mod, 'try_lease', return_value=None), patch.object(mod.os, 'execv') as run:
                with self.assertRaisesRegex(ValueError, 'outside'): mod.heavy(['--','true'])
                run.assert_not_called()
    def test_missing_mapping_fails_instead_of_queueing(self):
        with patch.dict(os.environ, {'FLEET_GCP_WORKSPACE_EXPERIMENTAL':'1','FLEET_HEAVY_CAPACITY':'1'}, clear=True), patch.object(mod, 'try_lease', return_value=None), contextlib.redirect_stderr(io.StringIO()):
            self.assertEqual(mod.heavy(['--','true']),75)

if __name__ == '__main__': unittest.main()
