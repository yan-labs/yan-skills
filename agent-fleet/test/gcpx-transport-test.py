import contextlib
import hashlib
import importlib.util
import io
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('gcpx_transport', Path(__file__).resolve().parents[1] / 'src/gcpx_transport.py')
transport = importlib.util.module_from_spec(spec)
spec.loader.exec_module(transport)

class TransportTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=os.environ.get('GCPX_TEST_TMPDIR'))
        self.addCleanup(self.tmp.cleanup)
        root = Path(self.tmp.name); member = root / 'exec-server'; member.write_bytes(b'test-server')
        archive = root / 'server.tar.gz'
        with tarfile.open(archive, 'w:gz') as tar: tar.add(member, arcname='exec-server')
        self.worker = {'root':'/home/u/gcpx','ssh_config':'/tmp/ssh-config','host':'worker',
                       'exec_server_archive':str(archive),'exec_server_sha256':hashlib.sha256(archive.read_bytes()).hexdigest(),
                       'exec_server_member':'exec-server'}
        self.state = root / 'state'; self.state.mkdir()

    def run_transport(self, fail_upload=False, cached=False):
        calls=[]
        def run(args, **kwargs):
            calls.append(args)
            if not cached and 'test -x' in args[-1]: raise subprocess.CalledProcessError(1,args)
            if fail_upload and 'tar -xzOf' in args[-1]: raise subprocess.CalledProcessError(1,args)
            if 'tar -xzOf' in args[-1]:
                self.assertEqual(kwargs['input'], Path(self.worker['exec_server_archive']).read_bytes())
            return subprocess.CompletedProcess(args,0)
        stdin=type('Stdin', (), {'buffer':io.BytesIO(b'')})()
        with patch.object(transport.subprocess,'run',side_effect=run), patch.object(transport.signal,'signal'), patch.object(transport.sys,'stdin',stdin), contextlib.redirect_stdout(io.StringIO()):
            if fail_upload:
                with self.assertRaises(subprocess.CalledProcessError): transport.serve(self.worker,'task',self.state)
            else: transport.serve(self.worker,'task',self.state)
        return calls

    def test_tunnel_precedes_upload_and_is_closed(self):
        calls=self.run_transport()
        self.assertIn('-Nf',calls[0])
        self.assertTrue(any('tar -xzOf' in call[-1] for call in calls[1:-1]))
        self.assertEqual(calls[-1][-3:-1],['-O','exit'])
        self.assertEqual(calls[0][calls[0].index('-S')+1],calls[1][calls[1].index('-S')+1])

    def test_valid_cache_avoids_archive_upload(self):
        calls=self.run_transport(cached=True)
        self.assertTrue(any('test -x' in call[-1] for call in calls))
        self.assertFalse(any('tar -xzOf' in call[-1] for call in calls))

    def test_upload_failure_cleans_owned_directory_and_tunnel(self):
        calls=self.run_transport(fail_upload=True)
        self.assertIn('-Nf',calls[0])
        self.assertTrue(any('rm -rf --' in call[-1] for call in calls))
        self.assertEqual(calls[-1][-3:-1],['-O','exit'])

if __name__ == '__main__': unittest.main()
