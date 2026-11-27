import sys
import unittest
import runpy
from unittest.mock import patch
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from gcp_pool_plan import Worker, plan_pool, choose_workspace


class PoolTests(unittest.TestCase):
    def test_reuse_stopped_before_create_and_cap(self):
        workers = [Worker('a', 'RUNNING', 2, managed=True), Worker('b', 'TERMINATED', managed=True)]
        p = plan_pool(workers, 5, 2, 3, 2000)
        self.assertEqual((p.start, p.create), (('b',), 1))

    def test_unknown_lease_never_counts_as_idle_or_free(self):
        w = Worker('a', 'RUNNING', None, 0, True)
        self.assertEqual(plan_pool([w], 0, 2, 2, 2000).stop, ())
        self.assertEqual(plan_pool([w], 1, 2, 2, 2000).create, 1)

    def test_idle_stop_requires_no_queue_and_elapsed_interval(self):
        workers = [Worker('a', 'RUNNING', 0, 100, True), Worker('b', 'RUNNING', 0, 201, True),
                   Worker('other', 'RUNNING', 0, 0, False)]
        self.assertEqual(plan_pool(workers, 0, 2, 3, 1900).stop, ('a',))
        self.assertEqual(plan_pool(workers, 1, 2, 3, 1900).stop, ())

    def test_transitional_capacity_prevents_duplicate_scale(self):
        p = plan_pool([Worker('a', 'PROVISIONING', managed=True)], 2, 2, 3, 0)
        self.assertEqual((p.start, p.create), ((), 0))

    def test_reject_invalid_state(self):
        with self.assertRaises(ValueError): plan_pool([Worker('a', 'RUNNING'), Worker('a', 'TERMINATED')], 1, 1, 2, 0)
        with self.assertRaises(ValueError): plan_pool([], 1, 0, 2, 0)


class RoutingTests(unittest.TestCase):
    def choose(self, **kw):
        args = dict(requested=None, pool='code', gcp_enabled=True)
        args.update(kw)
        return choose_workspace(**args)

    def test_code_defaults_to_gcp_and_light_stays_local(self):
        self.assertEqual(self.choose(), 'gcp')
        self.assertEqual(self.choose(pool='light'), 'local')
        self.assertEqual(self.choose(requested='local'), 'local')
        self.assertEqual(self.choose(pool='light', requested='gcp'), 'gcp')

    def test_gcp_unavailable_never_silently_falls_back(self):
        with self.assertRaises(RuntimeError): self.choose(gcp_enabled=False)
        with self.assertRaises(RuntimeError): self.choose(pool='light', requested='gcp', gcp_enabled=False)
        self.assertEqual(self.choose(requested='local', gcp_enabled=False), 'local')

    def test_bad_input_fails(self):
        with self.assertRaises(ValueError): self.choose(requested='cloud')
        with self.assertRaises(ValueError): self.choose(pool='unknown')

    def test_cli_accepts_workspace_and_blocks_unfinished_gcp_launch(self):
        fleet = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'src/fleet-go.py'))
        args = fleet['build_parser']().parse_args(['new', 'sample', '--to', 'gpt', '--workspace', 'gcp'])
        self.assertEqual(args.workspace, 'gcp')
        with self.assertRaisesRegex(ValueError, '禁止降级'):
            fleet['launch']({'workspace': 'gcp'})

    def test_experimental_entry_uses_remote_repo_and_never_runs_unsupported_executor(self):
        fleet = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'src/fleet-go.py'))
        meta = {'to': 'gpt', 'name': 'sample', 'brief': '/tmp/brief', 'report': '/tmp/report',
                'workspace': 'gcp', 'object': {'repo': '/tmp/repo'}, 'gcpx_branch': 'test'}
        self.assertEqual(fleet['command'](meta), ['fleet', 'code', '/tmp/brief', '--name', 'sample',
                         '--report', '/tmp/report', '--cwd', '/tmp/repo', '--workspace', 'gcp',
                         '--gcpx-branch', 'test', '--sol'])
        with patch.dict('os.environ', {'FLEET_GCP_WORKSPACE_EXPERIMENTAL': '1'}):
            with self.assertRaisesRegex(ValueError, '禁止降级'):
                fleet['launch']({**meta, 'to': 'gemini'})
        with self.assertRaisesRegex(ValueError, '入口仓库'):
            fleet['command']({**meta, 'object': {}})


if __name__ == '__main__': unittest.main()
