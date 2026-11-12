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

    def test_only_needed_submodule_initialized(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            def run(*args):
                return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            for name in ('sub-a', 'sub-b', 'remote'):
                run('git', 'init', '--bare', str(root/(name + '.git')))
            for name in ('sub-a', 'sub-b'):
                run('git', 'clone', str(root/(name + '.git')), str(root/name))
                run('git', '-C', str(root/name), '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '--allow-empty', '-m', 'init')
                run('git', '-C', str(root/name), 'push', 'origin', 'HEAD')
            run('git', 'clone', str(root/'remote.git'), str(root/'repo'))
            repo = root/'repo'
            for name in ('sub-a', 'sub-b'):
                run('git', '-C', str(repo), '-c', 'protocol.file.allow=always', 'submodule', 'add', str(root/(name + '.git')), name)
            run('git', '-C', str(repo), '-c', 'user.email=t@example.invalid', '-c', 'user.name=t', 'commit', '-m', 'subs')
            run('git', '-C', str(repo), 'push', '-u', 'origin', 'HEAD')
            os.environ['GIT_CONFIG_COUNT'] = '1'; os.environ['GIT_CONFIG_KEY_0'] = 'protocol.file.allow'; os.environ['GIT_CONFIG_VALUE_0'] = 'always'
            try:
                p = w.execute(dict(action='create', repo=str(repo), path=str(root/'repo-wt'/'t'), branch='yan/t-1', base=None, writes=['sub-b/src/x.py']))
                p2 = w.execute(dict(action='create', repo=str(repo), path=str(root/'repo-wt'/'u'), branch='yan/u-1', base=None))
            finally:
                for key in ('GIT_CONFIG_COUNT', 'GIT_CONFIG_KEY_0', 'GIT_CONFIG_VALUE_0'): os.environ.pop(key, None)
            target = Path(p['path'])
            self.assertTrue((target/'sub-b'/'.git').exists())
            self.assertFalse((target/'sub-a'/'.git').exists())
            self.assertFalse((Path(p2['path'])/'sub-a'/'.git').exists())
            self.assertFalse((Path(p2['path'])/'sub-b'/'.git').exists())

if __name__ == '__main__': unittest.main()
