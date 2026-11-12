"""Worktree operations executed on the machine that runs the task."""
import json
import os
from pathlib import Path
import subprocess


def git(cwd, *args):
    return subprocess.run(['git', '-C', str(cwd), *args], check=True, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout.strip()


def submodules_for(target, writes):
    """只初始化可写路径落在其中的子模块；默认一个都不拉（大仓全量 init 会卡十几分钟）。"""
    if not writes or not (Path(target) / '.gitmodules').exists():
        return []
    r = subprocess.run(['git', '-C', str(target), 'config', '-f', '.gitmodules', '--get-regexp', r'^submodule\..*\.path$'], text=True, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
    paths = [line.split(' ', 1)[1] for line in r.stdout.splitlines() if ' ' in line]
    return [sub for sub in paths if any(w == sub or w.startswith(sub + '/') for w in writes)]


def execute(p):
    repo = Path(p['repo']).resolve()
    target = Path(p['path']).resolve()
    if p['action'] == 'prune':
        if git(target, 'status', '--porcelain', '--untracked-files=all'):
            raise ValueError('worktree 有未提交或未跟踪的改动')
        branch = git(target, 'symbolic-ref', '--short', 'HEAD')
        if branch != p['branch']:
            raise ValueError('worktree 分支已改变')
        git(target, 'fetch', 'origin', '--prune')
        base = p['base'].removeprefix('origin/').removeprefix('refs/heads/')
        refs = ['origin/' + base, 'origin/' + branch]
        if not any(subprocess.run(['git', '-C', str(target), 'merge-base', '--is-ancestor', 'HEAD', ref], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0 for ref in refs):
            raise ValueError('功能分支既未合回基础分支，也未推送同名远端分支')
        git(repo, 'worktree', 'remove', str(target))
        git(repo, 'branch', '-D', branch)
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
    for sub in submodules_for(target, p.get('writes') or []):
        git(target, 'submodule', 'update', '--init', '--', sub)
    p['base'] = base
    return p
