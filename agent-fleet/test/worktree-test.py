import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('worktree', Path(__file__).resolve().parents[1] / 'src/worktree.py')
w = importlib.util.module_from_spec(spec)
spec.loader.exec_module(w)

class WorktreeTest(unittest.TestCase):
    def test_create_reuse_and_prune(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            def run(*args):
                return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            run('git', 'init', '--bare', str(root/'remote'))
            run('git', 'clone', str(root/'remote'), str(root/'repo'))
            repo = root/'repo'
            run('git', '-C', str(repo), 'config', 'user.email', 'test@example.invalid')
            run('git', '-C', str(repo), 'config', 'user.name', 'test')
            run('git', '-C', str(repo), 'commit', '--allow-empty', '-m', 'initial')
            run('git', '-C', str(repo), 'push', '-u', 'origin', 'HEAD')
            p = dict(action='create', repo=str(repo), path=str(root/'repo-wt'/'task'), branch='yan/task-20261112', base=None)
            p = w.execute(p)
            self.assertEqual(w.execute(p)['path'], p['path'])
            target = Path(p['path'])
            (target/'dirty').write_text('x')
            with self.assertRaises(ValueError): w.execute({**p, 'action':'prune'})
            (target/'dirty').unlink()
            run('git', '-C', str(target), 'commit', '--allow-empty', '-m', 'not pushed')
            with self.assertRaises(ValueError): w.execute({**p, 'action':'prune'})
            run('git', '-C', str(repo), 'merge', '--ff-only', p['branch'])
            run('git', '-C', str(repo), 'push', 'origin', 'HEAD')
            w.execute({**p, 'action':'prune'})
            self.assertFalse(target.exists())
            self.assertNotEqual(subprocess.run(['git', '-C', str(repo), 'show-ref', '--verify', '--quiet', 'refs/heads/' + p['branch']]).returncode, 0)

if __name__ == '__main__': unittest.main()
