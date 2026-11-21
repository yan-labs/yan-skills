"""Host-local flock leases. Keep the file inode stable and release on process exit."""

import fcntl
import json
import os
from pathlib import Path
import sys
import time

# A fixed path avoids separate pools for different worktrees, FLEET_HOME or TMPDIR.
ROOT = Path('/private/tmp' if sys.platform == 'darwin' else '/tmp') / f'agent-fleet-locks-{os.getuid()}'


def try_lease(name):
    ROOT.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(ROOT / name, os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        os.close(fd)
        return None
    return fd


def exec_with_lease(fd, command):
    os.set_inheritable(fd, True)
    os.execvp(command[0], command)


def heavy(args):
    gcp = args[:1] == ['--gcp']
    if gcp:
        args = args[1:]
    if args[:1] != ['--'] or len(args) < 2:
        raise ValueError('用法: fleet heavy [--gcp] -- <命令> [参数]')
    command = args[1:]
    capacity = int(os.environ.get('FLEET_HEAVY_CAPACITY', '3'))
    if capacity < 1:
        raise ValueError('FLEET_HEAVY_CAPACITY 必须为正整数')
    next_notice = 0
    while True:
        owners = []
        for i in range(capacity):
            name = f'heavy-{i + 1}'
            fd = try_lease(name)
            if fd is not None:
                os.ftruncate(fd, 0)
                owner = {'pid': os.getpid(), 'command': Path(command[0]).name}
                os.write(fd, json.dumps(owner).encode())
                print(f'[fleet heavy] acquired {i + 1}/{capacity} pid={owner["pid"]}', file=sys.stderr, flush=True)
                exec_with_lease(fd, command)
            try:
                owner = json.loads((ROOT / name).read_text())
                owners.append(f'{owner["pid"]}({owner["command"]})')
            except (OSError, ValueError, KeyError):
                owners.append(f'{name}(登记中)')
        now = time.monotonic()
        if gcp:
            print('Mini 重活名额已满，使用 fleet bg -- <已授权的 GCP 常备验证机命令>，按 job:job-… 等终态。',
                  file=sys.stderr)
            return 75
        if now >= next_notice:
            print(f'[fleet heavy] waiting | 占用 {", ".join(owners)} | 名额释放后约 1 秒接手，完成时间待占用者退出',
                  file=sys.stderr, flush=True)
            next_notice = now + 30
        time.sleep(1)


def archive(command):
    fd = try_lease('archive-sweep')
    if fd is None:
        if '--quiet' not in command:
            print('archive-sweep: skipped (already running)', file=sys.stderr)
        return 0
    os.environ['FLEET_ARCHIVE_LEASE_FD'] = str(fd)
    exec_with_lease(fd, command)


if __name__ == '__main__':
    mode, *args = sys.argv[1:]
    try:
        sys.exit(heavy(args) if mode == 'heavy' else archive(args))
    except (OSError, ValueError) as error:
        sys.exit(str(error))
