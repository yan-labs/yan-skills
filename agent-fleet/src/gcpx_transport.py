"""Private, short-lived SSH tunnel for the command-only GCP execution service.

The bearer capability is sent only over a pipe to the local caller. It is not
an AI provider credential. Closing stdin terminates the tunnel and worker.
"""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import shlex
import signal
import socket
import subprocess
import sys
import tarfile
import uuid


def serve(worker, workspace, state_root, control=None):
    archive = Path(worker['exec_server_archive']).expanduser()
    expected = worker['exec_server_sha256']
    member_name = worker['exec_server_member']
    if not re.fullmatch(r'[0-9a-f]{64}', expected) or not re.fullmatch(r'[A-Za-z0-9_.-]+', member_name):
        raise ValueError('invalid pinned execution-service archive configuration')
    digest = hashlib.sha256()
    with archive.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''): digest.update(chunk)
    if digest.hexdigest() != expected: raise ValueError('execution-service archive checksum mismatch')
    with tarfile.open(archive, 'r:gz') as tar:
        member = tar.getmember(member_name)
        if not member.isfile() or member.size <= 0 or member.size > 100 * 1024 * 1024:
            raise ValueError('invalid execution-service archive member')
        payload = tar.extractfile(member).read()
    payload_hash = hashlib.sha256(payload).hexdigest()
    root = PurePosixPath(worker['root'])
    if not root.is_absolute() or '..' in root.parts or str(root) == '/': raise ValueError('invalid worker root')
    ssh_config = Path(worker['ssh_config']).expanduser()
    if not ssh_config.is_absolute(): raise ValueError('ssh_config must be absolute')
    host = worker['host']
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,127}', host): raise ValueError('invalid ssh host')
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]{0,63}', workspace): raise ValueError('invalid workspace')
    unique = uuid.uuid4().hex
    remote = str(root / 'transport' / (workspace + '-' + unique))
    executable = remote + '/exec-server'
    cache = str(root / 'cache' / ('exec-server-' + payload_hash))
    if control is not None:
        if not isinstance(control.get('port'), int) or not 1 <= control['port'] <= 65535 or not re.fullmatch(r'[A-Za-z0-9_-]{40,128}', control.get('token', '')):
            raise ValueError('invalid control bridge capability')
    control_socket = str(Path(state_root) / ('ctl-' + unique[:16]))
    token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    common = ['/usr/bin/ssh', '-F', str(ssh_config), '-o', 'BatchMode=yes', '-S', control_socket]
    base = [*common, '-o', 'ControlMaster=no']
    owned = False
    master = False
    def remote_call(script, **kwargs):
        return subprocess.run([*base, host, script], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, **kwargs)
    def terminate(signum, _frame): raise SystemExit(128 + signum)
    for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP): signal.signal(sig, terminate)
    try:
        # Establish the tunnel first, so each setup command reuses the same IAP
        # connection instead of repeating a potentially slow SSH handshake.
        reverse = ['-R', f"127.0.0.1:{control['port']}:127.0.0.1:{control['port']}"] if control else []
        # -M plus ControlMaster=yes switches OpenSSH to ask mode, which makes
        # noninteractive shutdown fail and leaves the forwarding master alive.
        subprocess.run([*common, '-o', 'ControlMaster=yes', '-o', 'ExitOnForwardFailure=yes', '-Nf', '-L', f'127.0.0.1:{port}:127.0.0.1:{port}', *reverse, host], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        master = True
        remote_call('umask 077; mkdir -p -- ' + shlex.quote(str(root / 'transport')) + ' && mkdir -- ' + shlex.quote(remote))
        owned = True
        verify = 'printf %s ' + shlex.quote(payload_hash + '  ' + cache + '\n') + ' | sha256sum -c --status'
        try:
            remote_call('test -x ' + shlex.quote(cache) + ' && ' + verify)
        except subprocess.CalledProcessError:
            temporary = remote + '/exec-server.tmp'
            temp_verify = 'printf %s ' + shlex.quote(payload_hash + '  ' + temporary + '\n') + ' | sha256sum -c --status'
            remote_call('umask 077; mkdir -p -- ' + shlex.quote(str(root / 'cache')) + '; tar -xzOf - -- ' + shlex.quote(member_name)
                        + ' > ' + shlex.quote(temporary) + ' && ' + temp_verify + ' && chmod 700 ' + shlex.quote(temporary)
                        + ' && mv -f -- ' + shlex.quote(temporary) + ' ' + shlex.quote(cache), input=archive.read_bytes())
        remote_call('cp -- ' + shlex.quote(cache) + ' ' + shlex.quote(executable) + ' && chmod 700 ' + shlex.quote(executable))
        if control is not None:
            proxy = Path(__file__).with_name('gcpx_remote_fleet.py').read_bytes()
            remote_call('umask 077; mkdir -m 700 ' + shlex.quote(remote + '/bin') + '; cat > ' + shlex.quote(remote + '/bin/fleet') + ' && chmod 700 ' + shlex.quote(remote + '/bin/fleet'), input=proxy)
            remote_call('umask 077; cat > ' + shlex.quote(remote + '/bridge.json'), input=json.dumps(control).encode())
        # The service binds only loopback; SSH authenticates and forwards it.
        environ = ('PATH=' + shlex.quote(remote + '/bin') + ':"$PATH" FLEET_GCP_BRIDGE_FILE=' + shlex.quote(remote + '/bridge.json') + ' ') if control else ''
        command = environ + 'nohup ' + shlex.quote(executable) + ' --listen ' + shlex.quote(f'ws://127.0.0.1:{port}') + ' --ws-auth capability-token --ws-token-sha256 ' + token_hash + ' >' + shlex.quote(remote + '/server.log') + ' 2>&1 </dev/null & echo $! >' + shlex.quote(remote + '/server.pid')
        remote_call(command)
        if sys.stdout.isatty(): raise ValueError('transport capabilities may only be sent over a private pipe')
        ready = {'url': f'ws://127.0.0.1:{port}/', 'token': token}
        if control:
            ready.update({'proxyBin': remote + '/bin', 'bridgeFile': remote + '/bridge.json'})
        print(json.dumps(ready), flush=True)
        sys.stdin.buffer.read()
    finally:
        if owned:
            # A stale or reused pid is never killed unless it still executes our
            # exact binary. Directory names contain a fresh UUID owned by us.
            script = ('p=$(cat ' + shlex.quote(remote + '/server.pid') + ' 2>/dev/null || true); '
                      'case "$p" in ""|*[!0-9]*) ;; *) '
                      'if [ "$(readlink /proc/$p/exe 2>/dev/null || true)" = ' + shlex.quote(executable) + ' ]; then kill "$p" || true; fi;; esac; '
                      'rm -rf -- ' + shlex.quote(remote))
            subprocess.run([*base, host, script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        if master:
            subprocess.run([*base, '-O', 'exit', host], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
