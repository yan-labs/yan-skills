"""Worktree operations executed on the machine that runs the task."""
import json
import os
from pathlib import Path
import subprocess


def git(cwd, *args):
    return subprocess.run(['git', '-C', str(cwd), *args], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()


def execute(p):
    repo = Path(p['repo']).resolve()
    target = Path(p['path']).resolve()
    if p['action'] == 'prune':
        if git(target, 'status', '--porcelain', '--untracked-files=all'):
            raise ValueError('worktree 有未提交或未跟踪的改动')
        branch = git(target, 'symbolic-ref', '--short', 'HEAD')
        if branch != p['branch']:
            raise ValueError('worktree 分支已改变')
        git(target, 'fetch', 'origin', 'refs/heads/' + branch)
        git(target, 'merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD')
        git(repo, 'worktree', 'remove', str(target))
        return p
    if target.exists():
        if git(target, 'rev-parse', '--show-toplevel') != str(target) or git(target, 'symbolic-ref', '--short', 'HEAD') != p['branch'] or git(target, 'rev-parse', '--path-format=absolute', '--git-common-dir') != git(repo, 'rev-parse', '--path-format=absolute', '--git-common-dir'):
            raise ValueError('已有路径不属于本任务 worktree')
        p['base'] = p.get('base') or git(target, 'rev-parse', '--abbrev-ref', '@{upstream}')
        return p
    git(repo, 'fetch', 'origin')
    if p.get('base'):
        base = p['base']
    else:
        head = git(repo, 'ls-remote', '--symref', 'origin', 'HEAD').splitlines()[0]
        if not head.startswith('ref: refs/heads/'):
            raise ValueError('无法确定 origin 默认分支')
        base = 'origin/' + head.split('\t')[0].removeprefix('ref: refs/heads/')
    target.parent.mkdir(parents=True, exist_ok=True)
    git(repo, 'worktree', 'add', '-b', p['branch'], str(target), base)
    git(target, 'submodule', 'update', '--init')
    p['base'] = base
    return p
