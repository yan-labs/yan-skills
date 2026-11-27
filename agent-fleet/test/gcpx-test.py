import contextlib
import fcntl
import importlib.machinery
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

path = Path(__file__).resolve().parents[1] / 'bin/gcpx'
loader = importlib.machinery.SourceFileLoader('gcpx', str(path))
spec = importlib.util.spec_from_loader(loader.name, loader)
gcpx = importlib.util.module_from_spec(spec)
loader.exec_module(gcpx)

class GcpxTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get('GCPX_TEST_TMPDIR'))
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        gcpx.ROOT = self.root / 'state'
        self.cfg = self.root / 'config.json'
        self.cfg.write_text(json.dumps({'workers': {'worker': {'root': '/home/u/gcpx', 'host': 'worker', 'ssh_config': '/tmp/ssh-config'}}, 'repos': {'repo': {'worker': 'worker', 'url': 'git@example.org:org/repo.git'}}}))
        self.calls = []
    def call(self, *args):
        with patch.object(sys, 'argv', ['gcpx', '--config', str(self.cfg), '--json', *args]), contextlib.redirect_stdout(io.StringIO()) as out:
            gcpx.main()
            return json.loads(out.getvalue())
    def fake_ssh(self, worker, command, capture=False, tty=False):
        self.calls.append(command)
        result = 'a' * 40 + '\n' if 'worktree add' in command or 'rev-parse HEAD' in command else ''
        return type('Result', (), {'stdout': result, 'stderr': ''})()
    def test_workspace_create_list_remove(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh):
            created = self.call('ws', 'new', 'repo', '--name', 'task', '--branch', 'main')
            self.assertEqual(created['path'], '/home/u/gcpx/workspaces/task')
            self.assertIn('worktree add', self.calls[0])
            self.assertIn('task', self.call('ws', 'ls'))
            self.assertEqual(self.call('ws', 'rm', 'task')['removed'], 'task')
            self.assertEqual(self.call('ws', 'ls'), {})
            self.assertEqual([row['action'] for row in self.call('logs')], ['ws.new', 'ws.rm'])
    def test_logs_exclude_command_arguments(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        fake = type('Result', (), {'returncode': 37})()
        with patch.object(gcpx.subprocess, 'run', return_value=fake):
            with patch.object(sys, 'argv', ['gcpx', '--config', str(self.cfg), 'run', 'task', '--', 'echo', 'secret-argument']):
                self.assertEqual(gcpx.main(), 37)
        self.assertNotIn('secret-argument', (gcpx.ROOT / 'events.log').read_text())
        self.assertEqual(self.call('logs')[-1]['exit_code'], 37)
    def test_run_uses_configured_command_path(self):
        cfg = json.loads(self.cfg.read_text())
        cfg['workers']['worker']['command_path'] = '/opt/gcpx/bin:/usr/bin:/bin'
        self.cfg.write_text(json.dumps(cfg))
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        with patch.object(gcpx.subprocess, 'run', return_value=type('Result', (), {'returncode':0})()) as proc:
            with patch.object(sys, 'argv', ['gcpx', '--config', str(self.cfg), 'run', 'task', '--', 'node', '--version']): gcpx.main()
            self.assertIn('PATH=/opt/gcpx/bin:/usr/bin:/bin', proc.call_args.args[0][-1])
    def test_run_path_shell_metacharacters_are_single_argument(self):
        cfg = json.loads(self.cfg.read_text())
        tricky = "/opt/bin:'quoted';echo injected\nnext:/bin"
        cfg['workers']['worker']['command_path'] = tricky
        self.cfg.write_text(json.dumps(cfg))
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        with patch.object(gcpx.subprocess, 'run', return_value=type('Result', (), {'returncode':0})()) as proc:
            with patch.object(sys, 'argv', ['gcpx', '--config', str(self.cfg), 'run', 'task', '--', 'node', '--version']): gcpx.main()
            command = proc.call_args.args[0][-1].split(' && exec ', 1)[1]
            self.assertEqual(gcpx.shlex.split(command), ['env', 'PATH=' + tricky, 'node', '--version'])
    def test_creation_releases_registry_and_reserves_name(self):
        def check_lock(worker, command, capture=False, tty=False):
            with (gcpx.ROOT / 'lock').open('a') as other:
                fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
                self.assertEqual(gcpx.load_state()['task']['status'], 'creating')
            return self.fake_ssh(worker, command, capture, tty)
        with patch.object(gcpx, 'ssh', check_lock):
            self.call('ws', 'new', 'repo', '--name', 'task')
        self.assertNotIn('status', gcpx.load_state()['task'])
    def test_failed_creation_retains_reservation_for_inspection(self):
        with patch.object(gcpx, 'ssh', side_effect=OSError('connection lost')):
            with self.assertRaisesRegex(OSError, 'connection lost'):
                self.call('ws', 'new', 'repo', '--name', 'task')
        self.assertEqual(gcpx.load_state()['task']['status'], 'creating')
        with self.assertRaisesRegex(ValueError, 'creation is incomplete'):
            self.call('ws', 'rm', 'task')
    def test_reject_dirty_removal(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        with patch.object(gcpx, 'ssh', return_value=type('Result', (), {'stdout': '?? data\n'})()):
            with self.assertRaisesRegex(ValueError, 'uncommitted'): self.call('ws', 'rm', 'task')
        self.assertIn('task', self.call('ws', 'ls'))
    def test_active_workspace_cannot_be_removed(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh):
            self.call('ws', 'new', 'repo', '--name', 'task')
            with gcpx.workspace_lease('task'):
                with self.assertRaisesRegex(ValueError, 'in use'):
                    self.call('ws', 'rm', 'task')
    def test_gc_reaps_idle_workspace_but_retains_active(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh):
            self.call('ws', 'new', 'repo', '--name', 'task')
            state = gcpx.load_state(); state['task']['last_used'] = 1; gcpx.save_state(state)
            with gcpx.workspace_lease('task'):
                result = self.call('gc', '--older-than-hours', '1')
                self.assertIn('task', result['retained'])
            self.assertEqual(self.call('gc', '--older-than-hours', '1')['removed'], ['task'])
    def test_commit_is_retained(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        def changed(worker, command, capture=False, tty=False):
            r = self.fake_ssh(worker, command, capture, tty)
            if 'rev-parse HEAD' in command: r.stdout = 'b' * 40 + '\n'
            return r
        with patch.object(gcpx, 'ssh', changed):
            with self.assertRaisesRegex(ValueError, 'contains commits'): self.call('ws', 'rm', 'task')
    def test_bad_root_and_credentials_fail_closed(self):
        with self.assertRaises(ValueError): gcpx.remote_path('/tmp/../etc', 'x')
        cfg = json.loads(self.cfg.read_text()); cfg['repos']['repo']['url'] = 'https://user:password@example.org/a.git'; self.cfg.write_text(json.dumps(cfg))
        with self.assertRaisesRegex(ValueError, 'credentials'): self.call('ws', 'new', 'repo')
    def test_invalid_workspace_requests_do_not_allocate_workers(self):
        with patch.object(gcpx, 'allocate_worker') as allocate:
            for args in (('--name', '../bad'), ('--branch', '../bad'), ('--sha', 'abc')):
                with self.subTest(args=args), self.assertRaises(ValueError):
                    self.call('ws', 'new', 'repo', *args)
            cfg = json.loads(self.cfg.read_text())
            cfg['repos']['repo']['url'] = 'https://user:password@example.org/a.git'
            self.cfg.write_text(json.dumps(cfg))
            with self.assertRaisesRegex(ValueError, 'credentials'):
                self.call('ws', 'new', 'repo')
            allocate.assert_not_called()
        cfg['repos']['repo']['url'] = 'git@example.org:org/repo.git'
        self.cfg.write_text(json.dumps(cfg))
        with patch.object(gcpx, 'ssh', self.fake_ssh):
            self.call('ws', 'new', 'repo', '--name', 'task')
        with patch.object(gcpx, 'allocate_worker') as allocate:
            with self.assertRaisesRegex(ValueError, 'already exists'):
                self.call('ws', 'new', 'repo', '--name', 'task')
            allocate.assert_not_called()
    def test_worker_capacity_spreads_reservations_and_never_falls_back(self):
        cfg = json.loads(self.cfg.read_text())
        cfg['workers']['worker']['capacity'] = 1
        cfg['workers']['other'] = {**cfg['workers']['worker'], 'host': 'other'}
        cfg['repos']['repo']['workers'] = ['worker', 'other']
        self.cfg.write_text(json.dumps(cfg))
        with patch.object(gcpx, 'ssh', self.fake_ssh):
            first = self.call('ws', 'new', 'repo', '--name', 'first')
            second = self.call('ws', 'new', 'repo', '--name', 'second')
            self.assertNotEqual(first['worker'], second['worker'])
            with self.assertRaisesRegex(ValueError, 'capacity exhausted'):
                self.call('ws', 'new', 'repo', '--name', 'third')
            with self.assertRaisesRegex(ValueError, 'capacity exhausted'):
                self.call('ws', 'new', 'repo', '--name', 'fourth', '--worker', first['worker'])
    def test_incomplete_creation_consumes_capacity(self):
        cfg = json.loads(self.cfg.read_text()); cfg['workers']['worker']['capacity'] = 1
        self.cfg.write_text(json.dumps(cfg))
        with patch.object(gcpx, 'ssh', side_effect=OSError('connection lost')):
            with self.assertRaises(OSError): self.call('ws', 'new', 'repo', '--name', 'pending')
        with self.assertRaisesRegex(ValueError, 'capacity exhausted'):
            self.call('ws', 'new', 'repo', '--name', 'second')
    def test_invalid_worker_configuration_does_not_start_capacity(self):
        cfg = json.loads(self.cfg.read_text())
        worker = cfg['workers']['worker']
        worker.update({'managed': True, 'project': 'proj', 'zone': 'us-central1-a', 'instance': 'vm-one', 'pool': 'fleet'})
        with patch.object(gcpx, 'run') as run, patch.object(gcpx, 'start_worker') as start:
            for field, invalid in (('root', '/tmp/../bad'), ('ssh_config', 'relative'), ('host', '../bad')):
                original = worker[field]
                worker[field] = invalid
                with self.subTest(field=field), self.assertRaises(ValueError):
                    gcpx.allocate_worker(cfg, {}, 'repo')
                worker[field] = original
            run.assert_not_called()
            start.assert_not_called()
    def test_allocation_prefers_running_worker_and_starts_stopped_only_when_needed(self):
        cfg = json.loads(self.cfg.read_text())
        worker = cfg['workers']['worker']
        worker.update({'managed': True, 'project': 'proj', 'zone': 'us-central1-a', 'instance': 'vm-one', 'pool': 'fleet', 'capacity': 1})
        cfg['workers']['other'] = {**worker, 'instance': 'vm-two'}
        cfg['repos']['repo']['workers'] = ['worker', 'other']
        def describe(argv, **_kwargs):
            instance = argv[4]
            status = 'RUNNING' if instance == 'vm-one' else 'TERMINATED'
            return type('R', (), {'stdout': json.dumps({'name': instance, 'status': status, 'labels': {'gcpx-managed':'true', 'gcpx-pool':'fleet'}})})()
        gcpx.ROOT.mkdir()
        with patch.object(gcpx, 'run', side_effect=describe), patch.object(gcpx, 'verify_worker_disks'), patch.object(gcpx, 'start_worker') as start:
            self.assertEqual(gcpx.allocate_worker(cfg, {}, 'repo')[0], 'worker')
            start.assert_not_called()
            self.assertEqual(gcpx.allocate_worker(cfg, {'task': {'worker':'worker'}}, 'repo')[0], 'other')
            start.assert_called_once()
    def test_unready_candidate_uses_ready_worker_and_does_not_create_duplicates(self):
        cfg = json.loads(self.cfg.read_text()); worker = cfg['workers']['worker']
        worker.update({'managed': True, 'project': 'proj', 'zone': 'us-central1-a', 'instance': 'vm-one', 'pool': 'fleet', 'capacity': 1})
        cfg['workers']['other'] = {**worker, 'instance': 'vm-two', 'create': {'machine_type':'n2-standard-16'}}
        cfg['repos']['repo']['workers'] = ['other', 'worker']
        def describe(argv, **_kwargs):
            instance = 'vm-two' if 'list' in argv else 'vm-one'
            info = {'name':instance, 'status':'RUNNING', 'labels':{'gcpx-managed':'true','gcpx-pool':'fleet'}}
            return type('R', (), {'stdout': json.dumps([info] if 'list' in argv else info)})()
        with patch.object(gcpx, 'run', side_effect=describe), patch.object(gcpx, 'verify_worker_disks'), patch.object(gcpx, 'ssh', side_effect=OSError('not ready')), patch.object(gcpx, 'create_worker') as create:
            self.assertEqual(gcpx.allocate_worker(cfg, {}, 'repo')[0], 'worker')
            cfg['repos']['repo']['workers'] = ['other']
            with self.assertRaisesRegex(ValueError, 'bootstrap is not ready'):
                gcpx.allocate_worker(cfg, {}, 'repo')
            create.assert_not_called()
    def test_no_unsafe_worker_lifecycle(self):
        with self.assertRaisesRegex(ValueError, 'not explicitly managed'): self.call('up', 'worker')
        with self.assertRaisesRegex(ValueError, 'not explicitly managed'): self.call('down', 'worker')
    def test_start_requires_matching_current_compute_credit_and_reads_back(self):
        cfg = json.loads(self.cfg.read_text()); evidence = self.root / 'credit.json'
        cfg['workers']['worker'].update({'managed': True, 'project': 'proj', 'zone': 'us-central1-a', 'instance': 'vm-one', 'pool': 'fleet', 'credit_evidence': str(evidence)})
        self.cfg.write_text(json.dumps(cfg))
        instance = {'name': 'vm-one', 'status': 'TERMINATED', 'labels': {'gcpx-managed': 'true', 'gcpx-pool': 'fleet'}}
        proof = {'observed_at': 10000, 'remaining_usd': 200, 'monthly_estimate_usd': 100, 'compute_scope_verified': True, 'billing_account': 'billingAccounts/one'}
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(ValueError, 'explicitly configured'): gcpx.check_credit(cfg['workers']['worker'], 10000)
        evidence.write_text(json.dumps(proof))
        with patch.dict(os.environ, {'FLEET_GCP_MONTHLY_CAP': '99'}):
            with self.assertRaisesRegex(ValueError, 'credit evidence'): gcpx.check_credit(cfg['workers']['worker'], 10000)
        evidence.write_text(json.dumps({**proof, 'observed_at': 1}))
        with patch.dict(os.environ, {'FLEET_GCP_MONTHLY_CAP': '150'}), patch.object(gcpx, 'run') as cloud, patch.object(gcpx, 'verify_worker_disks'), patch.object(gcpx.time, 'time', return_value=10000):
            cloud.return_value.stdout = json.dumps(instance)
            with self.assertRaisesRegex(ValueError, 'credit evidence'): self.call('up', 'worker')
            self.assertEqual(cloud.call_count, 1)
        evidence.write_text(json.dumps(proof))
        with patch.dict(os.environ, {'FLEET_GCP_MONTHLY_CAP': '150'}), patch.object(gcpx, 'run') as cloud, patch.object(gcpx, 'verify_worker_disks'), patch.object(gcpx.time, 'time', return_value=10000):
            billing = {'billingEnabled': True, 'billingAccountName': 'billingAccounts/one'}
            cloud.side_effect = [type('R', (), {'stdout': json.dumps(instance)})(),
                                 type('R', (), {'stdout': json.dumps(billing)})(), None,
                                 type('R', (), {'stdout': json.dumps({**instance, 'status': 'RUNNING'})})()]
            self.assertEqual(self.call('up', 'worker')['status'], 'RUNNING')
            self.assertEqual(cloud.call_args_list[2].args[0][1:4], ['compute', 'instances', 'start'])
    def test_estimate_requires_cap_and_project_budget_alert(self):
        worker = {'project': 'proj', 'monthly_estimate_usd': 100}
        def response(value): return type('R', (), {'stdout': json.dumps(value)})()
        billing = {'billingEnabled': True, 'billingAccountName': 'billingAccounts/one'}
        project = {'projectNumber': '123'}
        good = {'budgetFilter': {'projects': ['projects/123']}, 'amount': {'specifiedAmount': {'currencyCode': 'USD', 'units': '150'}}, 'thresholdRules': [{'thresholdPercent': 0.8}]}
        with patch.dict(os.environ, {'FLEET_GCP_MONTHLY_CAP': '90'}), patch.object(gcpx, 'run') as cloud:
            with self.assertRaisesRegex(ValueError, 'monthly estimate'): gcpx.check_credit(worker, 1)
            cloud.assert_not_called()
        with patch.dict(os.environ, {}, clear=True), patch.object(gcpx, 'run') as cloud:
            with self.assertRaisesRegex(ValueError, 'explicitly configured'): gcpx.check_credit(worker, 1)
            cloud.assert_not_called()
        for bad in ({**good, 'amount': {'specifiedAmount': {'currencyCode': 'EUR', 'units': '150'}}}, {**good, 'amount': {'specifiedAmount': {'currencyCode': 'USD', 'units': '151'}}}, {'budgetFilter': {'projects': ['projects/999']}, 'thresholdRules': [1]}, {'budgetFilter': {'labels': {'x':['y']}}, 'thresholdRules': [1]}, {'budgetFilter': {}, 'thresholdRules': []}):
            with patch.dict(os.environ, {'FLEET_GCP_MONTHLY_CAP': '150'}), patch.object(gcpx, 'run', side_effect=[response(billing), response(project), response([bad])]):
                with self.assertRaisesRegex(ValueError, 'Budget alert'): gcpx.check_credit(worker, 1)
        with patch.dict(os.environ, {'FLEET_GCP_MONTHLY_CAP': '150'}), patch.object(gcpx, 'run', side_effect=[response(billing), response(project), response([good])]):
            gcpx.check_credit(worker, 1)
        scoped = {**good, 'budgetFilter': {'projects': ['projects/123'], 'labels': {'gcpx-managed': ['true']}}}
        with patch.dict(os.environ, {'FLEET_GCP_MONTHLY_CAP': '150'}), patch.object(gcpx, 'run', side_effect=[response(billing), response(project), response([scoped])]):
            gcpx.check_credit(worker, 1)
        with patch.dict(os.environ, {'FLEET_GCP_MONTHLY_CAP': '150'}), patch.object(gcpx, 'run', side_effect=OSError('cloud unavailable')):
            with self.assertRaisesRegex(OSError, 'cloud unavailable'): gcpx.check_credit(worker, 1)
    def test_status_marks_recorded_credit_as_unverified_and_stale(self):
        cfg = json.loads(self.cfg.read_text()); evidence = self.root / 'credit.json'
        cfg['workers']['worker']['credit_evidence'] = str(evidence)
        self.cfg.write_text(json.dumps(cfg))
        evidence.write_text(json.dumps({'observed_at':1, 'remaining_usd':200, 'monthly_estimate_usd':100, 'compute_scope_verified':True}))
        with patch.object(gcpx, 'ssh', self.fake_ssh), patch.object(gcpx.time, 'time', return_value=10000):
            credit = self.call('status')['credit_balance']
            self.assertEqual(credit['remaining_usd'], 200)
            self.assertFalse(credit['fresh'])
            self.assertFalse(credit['independently_verified'])
    def test_create_requires_credit_pool_room_and_confirmed_bootstrap(self):
        cfg = json.loads(self.cfg.read_text())
        cfg['workers']['worker'].update({'managed': True, 'project': 'proj', 'zone': 'us-central1-a', 'instance': 'vm-one', 'pool': 'fleet',
            'create': {'machine_type':'n2-standard-16', 'image_family':'ubuntu-2404-lts-amd64', 'image_project':'ubuntu-os-cloud', 'disk_gb':100}})
        gcpx.ROOT.mkdir()
        instance = {'name':'vm-one', 'status':'RUNNING', 'labels':{'gcpx-managed':'true', 'gcpx-pool':'fleet'}}
        result = lambda value: type('R', (), {'stdout':json.dumps(value)})()
        with patch.object(gcpx, 'check_credit') as credit, patch.object(gcpx, 'run') as cloud, patch.object(gcpx, 'ssh') as remote, patch.object(gcpx, 'verify_worker_disks') as verify:
            def do_cloud(argv, **kwargs):
                if argv[1:4] == ['compute','instances','list']: return result([])
                if argv[1:4] == ['compute','disks','create']:
                    instance['labels']['gcpx-create-id'] = argv[argv.index('--labels')+1].split('gcpx-create-id=')[1]
                    return None
                if argv[1:4] == ['compute','instances','create']: return None
                return result(instance)
            cloud.side_effect = do_cloud
            self.assertEqual(gcpx.create_worker(cfg, 'worker', 100)['status'], 'RUNNING')
            credit.assert_called_once()
            disk_create = cloud.call_args_list[1].args[0]
            self.assertTrue(any(str(x).startswith('gcpx-managed=true,gcpx-pool=fleet,gcpx-create-id=') for x in disk_create))
            create = cloud.call_args_list[2].args[0]
            verify.assert_called_once()
            self.assertIn('--no-service-account', create)
            self.assertIn('--no-address', create)
            remote.assert_called_once()
            self.assertEqual(list(gcpx.ROOT.glob('bootstrap.*.sh')), [])
        with patch.object(gcpx, 'check_credit'), patch.object(gcpx, 'run', return_value=result([{}, {}, {}])) as cloud:
            with self.assertRaisesRegex(ValueError, 'pool is at its configured limit'):
                gcpx.create_worker(cfg, 'worker', 100)
            self.assertEqual(cloud.call_count, 1)
        with patch.object(gcpx, 'check_credit', side_effect=ValueError('credit missing')), patch.object(gcpx, 'run') as cloud:
            with self.assertRaisesRegex(ValueError, 'credit missing'):
                gcpx.create_worker(cfg, 'worker', 100)
            cloud.assert_not_called()
    def test_failed_instance_create_triggers_tagged_cleanup(self):
        cfg = json.loads(self.cfg.read_text())
        cfg['workers']['worker'].update({'managed':True, 'project':'proj', 'zone':'us-central1-a', 'instance':'vm-one', 'pool':'fleet',
            'create':{'machine_type':'n2-standard-16','image_family':'ubuntu-2404-lts-amd64','image_project':'ubuntu-os-cloud','disk_gb':100}})
        gcpx.ROOT.mkdir()
        response = type('R', (), {'stdout':'[]'})()
        failure = gcpx.subprocess.CalledProcessError(1, ['gcloud'])
        with patch.object(gcpx, 'check_credit'), patch.object(gcpx, 'run', side_effect=[response, None, failure, response]) as cloud, patch.object(gcpx, 'cleanup_failed_creation') as cleanup:
            with self.assertRaisesRegex(ValueError, 'operation unconfirmed'): gcpx.create_worker(cfg, 'worker', 1)
            record = json.loads(gcpx.creation_path(cfg['workers']['worker']).read_text())
            self.assertEqual(record['phase'], 'instance_inflight')
            cleanup.assert_not_called()
            self.assertEqual(list(gcpx.ROOT.glob('bootstrap.*.sh')), [])
    def test_cleanup_deletes_only_owned_unattached_disk(self):
        worker = {'project':'proj','zone':'zone','instance':'vm','pool':'fleet'}
        disk = {'name':'vm-boot','zone':'https://example/zones/zone','labels':{'gcpx-managed':'true','gcpx-pool':'fleet','gcpx-create-id':'mine'}}
        response = lambda v: type('R', (), {'stdout':json.dumps(v)})()
        with patch.object(gcpx, 'run', side_effect=[response([]), response([disk]), None, response([])]) as cloud:
            gcpx.cleanup_failed_creation(worker, 'vm-boot', 'mine')
            self.assertEqual(cloud.call_args_list[2].args[0][1:4], ['compute','disks','delete'])
        with patch.object(gcpx, 'run', side_effect=[response([]), response([{**disk, 'users':['attached']}])]) as cloud:
            with self.assertRaisesRegex(ValueError, 'still attached'): gcpx.cleanup_failed_creation(worker, 'vm-boot', 'mine')
            self.assertEqual(cloud.call_count, 2)
        with patch.object(gcpx, 'run', side_effect=[response([]), response([{**disk, 'labels':{'gcpx-create-id':'other'}}])]) as cloud:
            with self.assertRaisesRegex(ValueError, 'ownership unconfirmed'): gcpx.cleanup_failed_creation(worker, 'vm-boot', 'mine')
            self.assertEqual(cloud.call_count, 2)
    def test_cleanup_deletes_only_matching_instance(self):
        worker = {'project':'proj','zone':'zone','instance':'vm','pool':'fleet'}
        disk_url = 'https://www.googleapis.com/compute/v1/projects/proj/zones/zone/disks/vm-boot'
        instance = {'name':'vm','zone':'https://example/zones/zone','labels':{'gcpx-managed':'true','gcpx-pool':'fleet','gcpx-create-id':'mine'},'disks':[{'boot':True,'source':disk_url}]}
        response = lambda v: type('R', (), {'stdout':json.dumps(v)})()
        with patch.object(gcpx, 'run', side_effect=[response([instance]), response([]), None, response([]), response([])]) as cloud:
            gcpx.cleanup_failed_creation(worker, 'vm-boot', 'mine')
            self.assertEqual(cloud.call_args_list[2].args[0][1:4], ['compute','instances','delete'])
        with patch.object(gcpx, 'run', side_effect=[response([{**instance,'disks':[]}]), response([])]) as cloud:
            with self.assertRaisesRegex(ValueError, 'unconfirmed'): gcpx.cleanup_failed_creation(worker, 'vm-boot', 'mine')
            self.assertEqual(cloud.call_count, 2)
    def test_recovery_waits_for_terminal_operation_and_retains_failures(self):
        worker = {'project':'proj','zone':'zone','instance':'vm','pool':'fleet'}
        path = gcpx.creation_path(worker)
        record = {**worker, 'creation_id':'mine','disk_name':'vm-boot','phase':'instance_inflight','phase_started':100}
        gcpx.save_creation(path, record, initial=True)
        target = 'https://www.googleapis.com/compute/v1/projects/proj/zones/zone/instances/vm'
        op = {'name':'op1','targetLink':target,'operationType':'insert','insertTime':'1970-01-01T00:01:40Z','status':'PENDING'}
        response = lambda v: type('R', (), {'stdout':json.dumps(v)})()
        with patch.object(gcpx, 'run', return_value=response([op])), patch.object(gcpx, 'cleanup_failed_creation') as cleanup:
            self.assertEqual(gcpx.recover_creation(worker, 200), 'creation operation unconfirmed')
            cleanup.assert_not_called(); self.assertTrue(path.exists())
            self.assertEqual(json.loads(path.read_text())['operation'], 'op1')
            self.assertEqual(json.loads(path.read_text())['operation_status'], 'PENDING')
        with patch.object(gcpx, 'run', return_value=response([{**op,'status':'DONE'}])), patch.object(gcpx, 'cleanup_failed_creation', side_effect=OSError('no permission')):
            with self.assertRaises(OSError): gcpx.recover_creation(worker, 200)
            self.assertEqual(json.loads(path.read_text())['phase'], 'cleanup')
        with patch.object(gcpx, 'cleanup_failed_creation') as cleanup:
            self.assertEqual(gcpx.recover_creation(worker, 201), 'cleaned')
            cleanup.assert_called_once(); self.assertFalse(path.exists())
    def test_bootstrap_pending_and_timeout_recovery(self):
        worker = {'project':'proj','zone':'zone','instance':'vm','pool':'fleet'}
        path = gcpx.creation_path(worker)
        record = {**worker, 'creation_id':'mine','disk_name':'vm-boot','phase':'bootstrap','phase_started':100}
        gcpx.save_creation(path, record, initial=True)
        with patch.object(gcpx, 'ensure_worker_ready', side_effect=ValueError('not ready')), patch.object(gcpx, 'cleanup_failed_creation') as cleanup:
            self.assertEqual(gcpx.recover_creation(worker, 999), 'bootstrap pending')
            cleanup.assert_not_called(); self.assertTrue(path.exists())
            self.assertEqual(gcpx.recover_creation(worker, 1000), 'cleaned')
            cleanup.assert_called_once(); self.assertFalse(path.exists())
    def test_public_network_requires_only_iap_ssh(self):
        worker = {'project':'proj', 'zone':'us-central1-a'}
        spec = {'public_egress':True, 'network':'safe', 'subnet':'sub'}
        net = 'https://www.googleapis.com/compute/v1/projects/proj/global/networks/safe'
        subnet = {'network':net}
        rule = {'network':net, 'direction':'INGRESS', 'sourceRanges':['35.235.240.0/20'], 'allowed':[{'IPProtocol':'tcp', 'ports':['22']}]}
        response = lambda value: type('R', (), {'stdout':json.dumps(value)})()
        with patch.object(gcpx, 'run', side_effect=[response(subnet), response([rule])]):
            self.assertEqual(gcpx.public_network_args(worker, spec), ['--network','safe','--subnet','sub'])
        with patch.object(gcpx, 'run', side_effect=[response(subnet), response([rule, {**rule, 'sourceRanges':['0.0.0.0/0']}])]):
            with self.assertRaisesRegex(ValueError, 'only IAP'): gcpx.public_network_args(worker, spec)
        with patch.object(gcpx, 'run', return_value=response({'network':'other'})):
            with self.assertRaisesRegex(ValueError, 'mismatch'): gcpx.public_network_args(worker, spec)
        self.assertEqual(gcpx.public_network_args(worker, {}), ['--no-address'])
    def test_worker_disks_must_be_labelled_and_owned(self):
        worker = {'project':'proj', 'zone':'zone', 'pool':'fleet'}
        instance = {'disks':[{'boot':True, 'source':'https://www.googleapis.com/compute/v1/projects/proj/zones/zone/disks/vm-boot'}]}
        result = lambda value: type('R', (), {'stdout':json.dumps(value)})()
        with patch.object(gcpx, 'run', return_value=result({'labels':{'gcpx-managed':'true', 'gcpx-pool':'fleet'}})):
            gcpx.verify_worker_disks(worker, instance)
        with patch.object(gcpx, 'run', return_value=result({'labels':{}})):
            with self.assertRaisesRegex(ValueError, 'disk ownership'): gcpx.verify_worker_disks(worker, instance)
        with self.assertRaisesRegex(ValueError, 'boot disk'): gcpx.verify_worker_disks(worker, {'disks':[]})
        with self.assertRaisesRegex(ValueError, 'outside'): gcpx.verify_worker_disks(worker, {'disks':[{'boot':True, 'source':'https://example.com/disk'}]})
    def test_stop_requires_ownership_and_no_active_workspace(self):
        cfg = json.loads(self.cfg.read_text())
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        cfg['workers']['worker'].update({'managed': True, 'project': 'proj', 'zone': 'us-central1-a', 'instance': 'vm-one', 'pool': 'fleet'})
        self.cfg.write_text(json.dumps(cfg))
        instance = {'name': 'vm-one', 'status': 'RUNNING', 'labels': {'gcpx-managed': 'true', 'gcpx-pool': 'fleet'}}
        with patch.object(gcpx, 'run') as cloud:
            with gcpx.workspace_lease('task'):
                with self.assertRaisesRegex(ValueError, 'in use'): self.call('down', 'worker')
            cloud.assert_not_called()
            cloud.return_value.stdout = json.dumps({**instance, 'labels': {}})
            with self.assertRaisesRegex(ValueError, 'ownership labels'): self.call('down', 'worker')
            self.assertEqual(cloud.call_count, 1)
        with patch.object(gcpx, 'run') as cloud:
            cloud.side_effect = [type('R', (), {'stdout': json.dumps(instance)})(), None,
                                 type('R', (), {'stdout': json.dumps({**instance, 'status': 'TERMINATED'})})()]
            self.assertEqual(self.call('down', 'worker')['status'], 'TERMINATED')
            self.assertEqual(cloud.call_args_list[1].args[0][1:4], ['compute', 'instances', 'stop'])
    def test_foreground_mount_holds_lease_until_unmounted(self):
        cfg = json.loads(self.cfg.read_text())
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        cfg['workers']['worker'].update({'managed': True, 'project': 'proj', 'zone': 'us-central1-a', 'instance': 'vm-one', 'pool': 'fleet'})
        state = gcpx.load_state()
        def mounted(program, command):
            self.assertEqual(program, 'sshfs')
            self.assertIn('-f', command)
            self.assertEqual(gcpx.reconcile_idle(cfg, state, 2000)['worker'], 'busy or unknown')
        cloud_instance = type('R', (), {'stdout':json.dumps({'name':'vm-one', 'labels':{'gcpx-managed':'true', 'gcpx-pool':'fleet'}})})()
        with patch.object(gcpx, 'run', return_value=cloud_instance), patch.object(gcpx, 'verify_worker_disks'), patch.object(gcpx.os, 'execvp', side_effect=mounted):
            with patch.object(sys, 'argv', ['gcpx', '--config', str(self.cfg), 'mount', 'task', str(self.root / 'mount')]):
                gcpx.main()
        with patch.object(gcpx, 'run', return_value=cloud_instance), patch.object(gcpx, 'verify_worker_disks'):
            self.assertEqual(gcpx.reconcile_idle(cfg, state, 2001)['worker'], 'observing idle')

    def test_idle_stop_requires_continuous_observation_and_resets_on_activity(self):
        cfg = json.loads(self.cfg.read_text())
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        cfg['workers']['worker'].update({'managed': True, 'project': 'proj', 'zone': 'us-central1-a', 'instance': 'vm-one', 'pool': 'fleet'})
        self.cfg.write_text(json.dumps(cfg))
        state = gcpx.load_state()
        cloud_instance = type('R', (), {'stdout':json.dumps({'name':'vm-one', 'labels':{'gcpx-managed':'true', 'gcpx-pool':'fleet'}})})()
        with patch.object(gcpx, 'run', return_value=cloud_instance), patch.object(gcpx, 'verify_worker_disks'), patch.object(gcpx, 'stop_worker', return_value={'status': 'TERMINATED'}) as stop:
            self.assertEqual(gcpx.reconcile_idle(cfg, state, 100)['worker'], 'observing idle')
            self.assertEqual(gcpx.reconcile_idle(cfg, state, 1899)['worker'], 'observing idle')
            with gcpx.workspace_lease('task'):
                self.assertEqual(gcpx.reconcile_idle(cfg, state, 1900)['worker'], 'busy or unknown')
            self.assertEqual(gcpx.reconcile_idle(cfg, state, 1901)['worker'], 'observing idle')
            gcpx.mark_worker_busy('worker')
            self.assertEqual(gcpx.reconcile_idle(cfg, state, 3701)['worker'], 'observing idle')
            self.assertEqual(gcpx.reconcile_idle(cfg, state, 5501)['worker'], 'TERMINATED')
            stop.assert_called_once()
    def test_idle_refuses_unverified_disk(self):
        cfg = json.loads(self.cfg.read_text())
        cfg['workers']['worker'].update({'managed':True, 'project':'proj', 'zone':'us-central1-a', 'instance':'vm-one', 'pool':'fleet'})
        gcpx.ROOT.mkdir()
        instance = type('R', (), {'stdout':json.dumps({'name':'vm-one', 'labels':{'gcpx-managed':'true','gcpx-pool':'fleet'}})})()
        with patch.object(gcpx, 'run', return_value=instance), patch.object(gcpx, 'verify_worker_disks', side_effect=ValueError('disk label missing')), patch.object(gcpx, 'stop_worker') as stop:
            self.assertEqual(gcpx.reconcile_idle(cfg, {}, 4000)['worker'], 'disk or ownership unconfirmed')
            stop.assert_not_called()
    def test_sync_lifecycle(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh), patch.object(gcpx, 'mutagen') as m:
            self.call('ws', 'new', 'repo', '--name', 'task')
            result = self.call('sync', 'task', str(self.root / 'mirror'))
            self.assertEqual(result['local'], str((self.root / 'mirror').resolve()))
            self.assertEqual(m.call_args_list[0].args[2:4], ('sync', 'create'))
            self.call('sync', 'task', str(self.root / 'mirror'), '--flush')
            self.call('ws', 'rm', 'task')
            self.assertEqual(m.call_args_list[-1].args[2:4], ('sync', 'terminate'))
    def test_sync_rejects_tracked_files_hidden_by_cache_exclusions(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        def tracked_file(worker, command, capture=False, tty=False):
            result = self.fake_ssh(worker, command, capture, tty)
            if 'ls-files' in command: result.stdout = 'src/build/source.js\0'
            return result
        with patch.object(gcpx, 'ssh', tracked_file), patch.object(gcpx, 'mutagen') as mutate:
            with self.assertRaisesRegex(ValueError, 'source files match'):
                self.call('sync', 'task', str(self.root / 'mirror'))
            mutate.assert_not_called()
            self.assertFalse((self.root / 'mirror').exists())
    def test_sync_rechecks_new_local_and_remote_source_on_each_flush(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh), patch.object(gcpx, 'mutagen') as mutate:
            self.call('ws', 'new', 'repo', '--name', 'task')
            mirror = self.root / 'mirror'
            self.call('sync', 'task', str(mirror))
            (mirror / 'src' / 'build').mkdir(parents=True)
            (mirror / 'src' / 'build' / 'source.js').write_text('source')
            mutate.reset_mock()
            with self.assertRaisesRegex(ValueError, 'local files match'):
                self.call('sync', 'task', str(mirror), '--flush')
            mutate.assert_not_called()
            (mirror / 'src' / 'build' / 'source.js').unlink()
            (mirror / 'src' / 'build').rmdir()
            def remote_added(worker, command, capture=False, tty=False):
                result = self.fake_ssh(worker, command, capture, tty)
                if 'ls-files' in command: result.stdout = 'src/dist/source.js\0'
                return result
            with patch.object(gcpx, 'ssh', remote_added):
                with self.assertRaisesRegex(ValueError, 'source files match'):
                    self.call('sync', 'task', str(mirror), '--flush')
                mutate.assert_not_called()
    def test_run_passes_exact_quoted_command_to_ssh(self):
        with patch.object(gcpx, 'ssh', self.fake_ssh): self.call('ws', 'new', 'repo', '--name', 'task')
        with patch.object(gcpx.subprocess, 'run', side_effect=RuntimeError('intercepted')) as call:
            with self.assertRaisesRegex(RuntimeError, 'intercepted'): self.call('run', 'task', '--', 'printf', '%s', 'a; echo unsafe')
            self.assertEqual(call.call_args.args[0][0], '/usr/bin/ssh')
            self.assertIn("'a; echo unsafe'", call.call_args.args[0][-1])

if __name__ == '__main__': unittest.main()
