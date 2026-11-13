import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
import clean


class CleanTest(unittest.TestCase):
    def test_age_and_retention(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            runs, reports = home / '.agent-fleet/runs', home / '.agent-reports'
            old = time.time() - 15 * 86400
            def put(root, name, text='fixture', aged=True):
                p = root / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text(text)
                if aged:
                    os.utime(p, (old, old))
                return p
            keep = [put(runs, name) for name in ['ledger.jsonl', 'dispatch-order.md', 'patrol-brief.md', '.env', 'config.json', 'DBBackup/safe.log', 'BACKUP.log']]
            keep.append(put(runs, 'fresh.log', aged=False))
            for state in ['running', 'queued', 'parked', 'waiting']:
                report = put(reports, '2020-01-01/' + state + '.md')
                brief = put(runs, state + '.brief.md', 'REPORT: ' + str(report))
                body = put(runs, state + '.body.md')
                keep += [report, brief, body]
                keep.append(put(runs, state + '.brief.json', json.dumps({'name': state, 'brief': str(brief), 'body': str(body)})))
                keep.append(put(runs, state + '.json', json.dumps({'runId': state, 'name': state, 'status': state, 'briefPath': str(brief)})))
                keep.append(put(runs, state + '.log'))
            keep.append(put(runs, 'foreground.pid.json', json.dumps({'pid': os.getpid()})))
            keep.append(put(runs, 'foreground.log'))
            doomed = [put(runs, 'done.log'), put(runs, 'done.json', '{"status":"done","runId":"done"}'), put(reports, '2020-01-02/fleet-patrol.md')]
            preview = clean.clean_local('1w', True, home, runs)
            self.assertEqual(preview['files'], len(doomed))
            self.assertTrue(all(p.exists() for p in doomed))
            self.assertTrue(any('BACKUP' in r['path'] for r in preview['pendingConfirmation']))
            applied = clean.clean_local('7d', False, home, runs)
            self.assertEqual(applied['files'], len(doomed))
            self.assertTrue(all(not p.exists() for p in doomed))
            self.assertTrue(all(p.exists() for p in keep))
            self.assertFalse((home / '.agent-fleet/trash').exists())
            self.assertFalse((reports / '2020-01-02').exists())
            for bad in ['0d', '-1d', 'foo', '7', '1h']:
                with self.assertRaises(ValueError):
                    clean.age_seconds(bad)

    def test_merged_worktrees_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            repo, runs = home / 'repo', home / '.agent-fleet/runs'
            runs.mkdir(parents=True)
            repo.mkdir()
            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL, text=True)
            git('init', '-b', 'main')
            git('config', 'user.name', 'Test')
            git('config', 'user.email', 'test@example.com')
            (repo / 'base').write_text('base')
            (repo / '.gitignore').write_text('DBBackup/\n')
            git('add', '.')
            git('commit', '-m', 'base')
            for name in ['merged', 'dirty', 'unmerged', 'with-proof', 'active']:
                wt = home / name
                git('worktree', 'add', '-b', name, str(wt))
                if name == 'dirty':
                    (wt / 'base').write_text('dirty')
                if name == 'unmerged':
                    subprocess.check_call(['git', '-C', str(wt), 'commit', '--allow-empty', '-m', 'unmerged'], stdout=subprocess.DEVNULL)
                if name == 'with-proof':
                    (wt / 'DBBackup').mkdir()
                    (wt / 'DBBackup/proof.bin').write_text('fixture')
                row = {'name': name, 'worktree': {'repo': str(repo), 'path': str(wt), 'branch': name, 'base': 'main'}}
                metadata = home / '.agent-reports/2020-01-01' / (name + '.brief.json')
                metadata.parent.mkdir(parents=True, exist_ok=True)
                metadata.write_text(json.dumps(row))
                if name == 'active':
                    (runs / 'active.json').write_text(json.dumps({'name': name, 'runId': 'active', 'status': 'running'}))
            old = time.time() - 15 * 86400
            for p in home.rglob('*'):
                os.utime(p, (old, old))
            plan = clean.clean_local('7d', True, home, runs)
            self.assertEqual([r['path'] for r in plan['worktrees']], [str(home / 'merged')])
            self.assertEqual(sum(g['bytes'] for g in plan['pendingGroups']), 7)
            self.assertEqual(sum(g['fileCount'] for g in plan['pendingGroups']), 1)
            clean.clean_local('7d', False, home, runs)
            self.assertFalse((home / 'merged').exists())
            for name in ['dirty', 'unmerged', 'with-proof', 'active']:
                self.assertTrue((home / name).exists())

    def test_ignored_worktree_config_and_whitelist_are_preserved(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            repo, runs = home / 'repo', home / '.agent-fleet/runs'
            repo.mkdir()
            runs.mkdir(parents=True)
            def git(*args):
                return subprocess.check_output(['git', '-C', str(repo), *args], stderr=subprocess.DEVNULL, text=True)
            git('init', '-b', 'main')
            git('config', 'user.name', 'Test')
            git('config', 'user.email', 'test@example.com')
            (repo / '.gitignore').write_text('settings.yaml\n.keep-data\nprivate.bin\n')
            git('add', '.')
            git('commit', '-m', 'base')
            wt = home / 'merged'
            git('worktree', 'add', '-b', 'merged', str(wt))
            for name, content in [('settings.yaml', 'fixture'), ('.keep-data', 'private.bin\n'), ('private.bin', 'fixture')]:
                (wt / name).write_text(content)
            (runs / 'merged.json').write_text(json.dumps({'name': 'merged', 'status': 'done', 'worktree': {'repo': str(repo), 'path': str(wt), 'branch': 'merged', 'base': 'main'}}))
            old = time.time() - 15 * 86400
            for p in home.rglob('*'):
                os.utime(p, (old, old))
            result = clean.clean_local('7d', False, home, runs)
            self.assertTrue(all((wt / name).exists() for name in ['settings.yaml', '.keep-data', 'private.bin']))
            reason = next(r['reason'] for r in result['skipped'] if r['path'] == str(wt))
            self.assertTrue(all(name in reason for name in ['settings.yaml', '.keep-data', 'private.bin']))
            self.assertEqual(result['worktrees'], [])

    def test_pending_and_explicit_approval(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            runs, reports = home / '.agent-fleet/runs', home / '.agent-reports'
            runs.mkdir(parents=True)
            reports.mkdir()
            old = time.time() - 15 * 86400
            selected = []
            for rel in ['evidence/shot.png', 'Backup/db.sql', 'snapshot.json', 'dump.tar.gz']:
                p = reports / rel
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text('fixture')
                os.utime(p, (old, old))
                selected.append(p)
            doc = reports / 'index.md'
            doc.write_text('[proof](evidence/shot.png)')
            preview = clean.clean_local('7d', True, home, runs)
            self.assertEqual(preview['files'], 0)
            self.assertEqual(len(preview['pendingConfirmation']), 4)
            pending = next(r for r in preview['pendingConfirmation'] if r['path'] == str(selected[0]))
            self.assertEqual(pending['bytes'], 7)
            self.assertEqual(pending['referencedBy'], [str(doc)])
            for key in ['modifiedAt', 'taskOrProject', 'usefulness']:
                self.assertTrue(pending[key])
            recent = reports / 'evidence/new.png'
            recent.write_text('recent')
            active = runs / 'active.json'
            active.write_text(json.dumps({'runId': 'active', 'status': 'queued', 'reportPath': str(selected[1])}))
            result = clean.clean_local('7d', False, home, runs, include_backups=[str(reports)])
            self.assertEqual(result['files'], 3)
            self.assertTrue(selected[1].exists())
            self.assertTrue(recent.exists())
            self.assertFalse(selected[0].exists())

    def test_config_state_and_whitelist_survive_apply(self):
        with tempfile.TemporaryDirectory() as tmp:
            home = Path(tmp)
            runs, reports = home / '.agent-fleet/runs', home / '.agent-reports'
            runs.mkdir(parents=True)
            reports.mkdir()
            old = time.time() - 20 * 86400
            retained = []
            for name in ['settings.yaml', 'state.json', 'task-checkpoint.json', 'cursor.toml', 'config.yml', '.env.local', 'keep.log', 'nested/golden.csv']:
                p = runs / name
                p.parent.mkdir(parents=True, exist_ok=True)
                p.write_text('{}')
                os.utime(p, (old, old))
                retained.append(p)
            (runs / '.keep-data').write_text('keep.log # retain\nnested/*.csv samples\n')
            doomed = runs / 'old.log'
            doomed.write_text('old')
            os.utime(doomed, (old, old))
            result = clean.clean_local('7d', False, home, runs)
            self.assertFalse(doomed.exists())
            self.assertTrue(all(p.exists() for p in retained))
            self.assertTrue((runs / '.keep-data').exists())
            self.assertEqual(result['files'], 1)

    def test_pending_groups_are_bounded_and_keep_details(self):
        items = [{'path': '/reports/task-' + str(i) + '/evidence/shot.png', 'bytes': i, 'modifiedAt': '2026-01-01T00:00:00Z', 'referencedBy': ['report.md'] if i == 0 else []} for i in range(120)]
        items.append({'path': '/reports/snapshot.json', 'bytes': 0, 'modifiedAt': '2026-01-01T00:00:00Z', 'referencedBy': []})
        groups = clean.group_pending(items, [Path('/reports')])
        self.assertLessEqual(len(groups), 50)
        self.assertEqual(sum(g['fileCount'] for g in groups), len(items))
        self.assertTrue(all(not (Path(a['prefix']) != Path(b['prefix']) and Path(a['prefix']).is_relative_to(Path(b['prefix']))) for a in groups for b in groups))
        self.assertEqual(sum(g['bytes'] for g in groups), sum(i['bytes'] for i in items))
        self.assertTrue(any(g['referenced'] for g in groups))

    def test_remote_transport(self):
        import mini
        from types import SimpleNamespace
        scripts = []
        payloads = []
        def call(source, payload, timeout):
            scripts.append(source)
            payloads.append(payload)
            result = subprocess.run([sys.executable, '-c', source, __import__('base64').b64encode(json.dumps(payload).encode()).decode()], text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            return result
        with tempfile.TemporaryDirectory() as home, patch.object(mini, 'REMOTE_HOME', home), patch.object(mini, 'REMOTE_BIN', '/bin/fleet'), patch.object(mini, 'call', call), patch.object(clean, 'clean_local', return_value={'activeNames': []}) as local:
            clean.command(SimpleNamespace(older_than='7d', dry_run=True, include_backups=['/local/approved', 'mini:/remote/approved'], json=True))
            self.assertEqual(local.call_args.kwargs['include_backups'], ['/local/approved'])
        self.assertEqual(len(scripts), 1)
        self.assertEqual(payloads[0]['include_backups'], ['/remote/approved'])


if __name__ == '__main__':
    unittest.main()
