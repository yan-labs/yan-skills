#!/usr/bin/env python3
"""Route package-manager and build commands through the host lease pool."""

import os
from pathlib import Path
import shutil
import sys


HEAVY_COMMANDS = {'install', 'i', 'add', 'ci', 'test', 'build', 'dev', 'start'}
HEAVY_SCRIPTS = {'test', 'build', 'dev', 'e2e', 'start'}
DIRECT_TOOLS = {'vitest', 'jest', 'tsc', 'next', 'vite'}
QUERY_FLAGS = {'--help', '-h', '--version', '-v', '-V'}
OPTIONS_WITH_VALUE = {
    '-C', '--dir', '--cwd', '--prefix', '--filter', '-F', '--workspace',
    '-w', '--config', '--package', '-p',
}


def command_args(args):
    """Skip options that can precede the command or script name."""
    args = iter(args)
    for arg in args:
        if arg == '--':
            return list(args)
        if arg in QUERY_FLAGS:
            return []
        if arg in OPTIONS_WITH_VALUE:
            next(args, None)
        elif not arg.startswith('-'):
            return [arg, *args]
    return []


def is_heavy(tool, args):
    if tool in DIRECT_TOOLS and any(arg in QUERY_FLAGS for arg in args):
        return False
    args = command_args(args)
    if tool in DIRECT_TOOLS:
        return tool in {'vitest', 'jest', 'tsc', 'vite'} or bool(
            args and args[0] in {'build', 'dev', 'start'}
        )
    if not args:
        return False
    command, *rest = args
    if tool == 'npx' or (tool == 'bun' and command == 'x'):
        target = args if tool == 'npx' else command_args(rest)
        return bool(target and target[0] in DIRECT_TOOLS and is_heavy(target[0], target[1:]))
    if command in HEAVY_COMMANDS:
        return True
    target = command_args(rest)
    if command == 'run':
        return bool(target and target[0] in HEAVY_SCRIPTS)
    if command in {'exec', 'dlx'}:
        return bool(target and target[0] in DIRECT_TOOLS and is_heavy(target[0], target[1:]))
    return tool in {'pnpm', 'yarn'} and command in DIRECT_TOOLS and is_heavy(command, rest)


def lease_active():
    try:
        pid = int(os.environ.get('FLEET_HEAVY_LEASE_PID', '0'))
        if pid <= 0:
            return False
        os.kill(pid, 0)
        return True
    except (OSError, ValueError):
        return False


def main():
    shim = Path(__file__).resolve()
    tool = Path(sys.argv[0]).name
    for directory in os.get_exec_path():
        if Path(directory).resolve() == shim.parent:
            continue
        executable = shutil.which(tool, path=directory or '.')
        if executable and Path(executable).resolve() != shim:
            break
    else:
        print(f'{tool}: command not found outside fleet shims', file=sys.stderr)
        return 127

    args = sys.argv[1:]
    if os.environ.get('FLEET_HEAVY_BYPASS') != '1' and not lease_active() and is_heavy(tool, args):
        fleet = str(shim.parent.parent / 'bin' / 'fleet')
        os.execv(fleet, [fleet, 'heavy', '--', executable, *args])
    os.execv(executable, [executable, *args])


if __name__ == '__main__':
    sys.exit(main())
