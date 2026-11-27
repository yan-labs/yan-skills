"""Host-local flock leases. Keep the file inode stable and release on process exit."""

import fcntl
import json
import os
import re
import subprocess
import uuid
from contextlib import contextmanager
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

def overflow_to_gcpx(command):
    """Route only when the caller supplies an established workspace mapping."""
    workspace = os.environ.get('FLEET_GCPX_WORKSPACE')
    config = os.environ.get('FLEET_GCPX_CONFIG')
    mirror = os.environ.get('FLEET_GCPX_MIRROR')
    if not all((workspace, config, mirror)):
        return False
    if not Path(config).is_absolute() or not Path(mirror).is_absolute():
        raise ValueError('GCP workspace config and mirror must be absolute paths')
    try:
        relative = Path.cwd().resolve().relative_to(Path(mirror).resolve(strict=True))
    except (ValueError, OSError):
        raise ValueError('current directory is outside the mapped GCP workspace')
    gcpx = Path(__file__).resolve().parents[1] / 'bin/gcpx'
    print('[fleet heavy] Mini capacity full; executing in mapped GCP workspace', file=sys.stderr, flush=True)
    os.execv(str(gcpx), [str(gcpx), '--config', config, 'run', workspace, '--',
                         'sh', '-c', 'cd -- "$1" || exit; shift; exec "$@"', 'sh', str(relative), *command])


def capacity_state():
    """Return True/False, or None when any required metric is unavailable."""
    try:
        cpus = os.cpu_count()
        if not cpus:
            return None
        load = os.getloadavg()[0]
        if sys.platform != 'darwin':
            return None
        pressure = int(subprocess.check_output(
            ['sysctl', '-n', 'kern.memorystatus_vm_pressure_level'], text=True, timeout=3).strip())
        swap = subprocess.check_output(['sysctl', '-n', 'vm.swapusage'], text=True, timeout=3)
        match = re.search(r'free\s*=\s*([0-9.]+)([KMG])', swap)
        if pressure not in (1, 2, 4) or not match:
            return None
        free = float(match.group(1)) * {'K': 1024, 'M': 1024**2, 'G': 1024**3}[match.group(2)]
        return load < cpus * 1.5 and pressure != 4 and free > 2 * 1024**3
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


@contextmanager
def allocation_guard():
    ROOT.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(ROOT / 'heavy-allocation', os.O_RDWR | os.O_CREAT, 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def active_leases():
    active = []
    for path in ROOT.glob('heavy-[0-9]*'):
        if not re.fullmatch(r'heavy-[1-9][0-9]*', path.name):
            continue
        fd = try_lease(path.name)
        if fd is None:
            active.append(int(path.name[6:]))
        else:
            os.close(fd)
    return sorted(active)


def queue_ticket():
    queue = ROOT / 'heavy-queue'
    queue.mkdir(mode=0o700, exist_ok=True)
    path = queue / f'{time.monotonic_ns():020d}-{uuid.uuid4().hex}'
    fd = os.open(path, os.O_RDWR | os.O_CREAT | os.O_EXCL, 0o600)
    fcntl.flock(fd, fcntl.LOCK_EX)
    return path, fd


def queue_head(ticket):
    for path in sorted(ticket.parent.iterdir()):
        if path == ticket:
            return True
        try:
            fd = os.open(path, os.O_RDWR)
        except FileNotFoundError:
            continue
        try:
            try:
                fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                return False
            path.unlink(missing_ok=True)
        finally:
            os.close(fd)
    return False


def remotely_capable(command):
    # Only classify direct tool invocations with a clear build/test operation.
    tool = Path(command[0]).name
    if tool == 'pnpm':
        return any(x in ('install', 'test', 'build', 'vitest', 'jest', 'tsc', 'typecheck') for x in command[1:])
    return tool in ('tsc', 'vitest', 'jest', 'mvn', 'gradle', 'gradlew')


def heavy(args):
    gcp = args[:1] == ['--gcp']
    if gcp:
        args = args[1:]
    if args[:1] != ['--'] or len(args) < 2:
        raise ValueError('用法: fleet heavy [--gcp] -- <命令> [参数]')
    command = args[1:]
    # Existing callers may set an emergency ceiling; absent means no fixed cap.
    raw_cap = os.environ.get('FLEET_HEAVY_CAPACITY')
    cap = int(raw_cap) if raw_cap else None
    if cap is not None and cap < 1:
        raise ValueError('FLEET_HEAVY_CAPACITY 必须为正整数')
    with allocation_guard():
        ticket, ticket_fd = queue_ticket()
    next_notice = 0
    try:
        while True:
            with allocation_guard():
                active = active_leases()
                state = capacity_state()
                allowed = state is True or (state is None and not active)
                if cap is not None and len(active) >= cap:
                    allowed = False
                if queue_head(ticket) and allowed:
                    number = 1
                    while number in active:
                        number += 1
                    fd = try_lease(f'heavy-{number}')
                    if fd is not None:
                        owner = {'pid': os.getpid(), 'command': Path(command[0]).name}
                        os.ftruncate(fd, 0)
                        os.write(fd, json.dumps(owner).encode())
                        ticket.unlink(missing_ok=True)
                        os.close(ticket_fd)
                        ticket_fd = None
                        print(f'[fleet heavy] acquired {number} pid={owner["pid"]}', file=sys.stderr, flush=True)
                        os.environ['FLEET_HEAVY_LEASE_PID'] = str(owner['pid'])
                        # Drop allocation guard before exec; lease remains held.
                        break
            if not allowed and (gcp or os.environ.get('FLEET_GCP_WORKSPACE_EXPERIMENTAL') == '1' or
                                (remotely_capable(command) and os.environ.get('FLEET_GCPX_WORKSPACE'))):
                if overflow_to_gcpx(command):
                    return 0
                print('Mini 承载不足，缺少安全 GCP 工作区映射；未在本机执行。', file=sys.stderr)
                return 75
            now = time.monotonic()
            if now >= next_notice:
                print(f'[fleet heavy] waiting FIFO | active={active} capacity={state}', file=sys.stderr, flush=True)
                next_notice = now + 30
            time.sleep(1)
        exec_with_lease(fd, command)
    finally:
        ticket.unlink(missing_ok=True)
        if ticket_fd is not None:
            os.close(ticket_fd)


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
