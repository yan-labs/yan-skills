"""Time-based permanent cleanup; evidence/backups need explicit path approval; no symlink traversal."""
import json
import datetime
import os
from pathlib import Path
import re
import subprocess
import time

PRESERVE = {'ledger.jsonl', 'dispatch-order.md', 'patrol-brief.md', '.env', 'config.json', 'mini.json', 'models.config.json'}
TERMINAL = {'done', 'failed', 'stopped', 'blocked', 'completed', 'cancelled'}


def age_seconds(value):
    if not re.fullmatch(r'[1-9]\d*[dw]', value):
        raise ValueError('--older-than 需要正整数 Nd 或 Nw')
    return int(value[:-1]) * (7 if value[-1] == 'w' else 1) * 86400


def sensitive(p):
    return bool(re.search(r'backup|evidence|snapshot|dump|\.(?:bak|orig|sql|rdb|sqlite3?|db)(?:\.|$)|~$', str(p), re.I))


def files(root, skipped):
    if root.is_symlink():
        skipped.append({'path': str(root), 'reason': 'symlink root'})
        return []
    if not root.exists():
        return []
    out = []
    for p in sorted(root.iterdir()):
        if p.is_symlink() or not p.is_dir():
            out.append(p)
        else:
            children = files(p, skipped)
            out.extend(children)
            if not children and sensitive(p):
                skipped.append({'path': str(p), 'reason': '待确认：空证据/备份目录'})
    return out


def document_references(paths):
    from urllib.parse import unquote
    refs = {}
    for doc in paths:
        if doc.suffix != '.md' or doc.is_symlink():
            continue
        text = doc.read_text(errors='replace')
        candidates = re.findall(r'\]\(([^)\s]+)|`([^`\n]+)`|(?<![\w:])(/[^\s`"<>\[\]()]+)', text)
        for match in candidates:
            target = unquote(next(s for s in match if s).split('#')[0])
            if not target or re.match(r'^[a-z][a-z0-9+.-]*:', target, re.I) or any(c.isspace() for c in target):
                continue
            key = os.path.abspath(doc.parent / target)
            refs.setdefault(key, set()).add(str(doc))
    return refs


def referenced_by(p, refs):
    return sorted(refs.get(os.path.abspath(p), set()) - {str(p)})


def read_json(p):
    try:
        value = json.loads(p.read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def alive(pid):
    if not isinstance(pid, int) or pid <= 0:
        return False
    try:
        os.kill(pid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def git(repo, *args):
    return subprocess.run(['git', '-C', str(repo), *args], text=True, capture_output=True, check=True).stdout.strip()


def clean_local(older_than='7d', dry_run=False, home=None, runs=None, location='local', peer_active_names=None, include_backups=None):
    home = Path(home or Path.home())
    fleet = home / '.agent-fleet'
    runs = Path(runs or os.environ.get('AGENT_FLEET_RUNS_DIR', fleet / 'runs'))
    reports = home / '.agent-reports'
    cutoff = time.time() - age_seconds(older_than)
    skipped, deleted, worktrees = [], [], []
    run_files = files(runs, skipped)
    report_files = files(reports, skipped)
    protected, active_ids, active_names = set(), set(), set(peer_active_names or [])
    run_set = set(run_files)
    rows = [(p, read_json(p)) for p in run_files + report_files if p.suffix == '.json' and (p in run_set or p.name.endswith('.brief.json')) and not p.is_symlink()]
    if peer_active_names is None:
        active_names.update(row['name'] for _, row in rows if row.get('name') and row.get('execution') in ('mini', 'local') and row['execution'] != location)
    for p, row in rows:
        state = row.get('status') or row.get('state')
        if (isinstance(state, str) and state not in TERMINAL) or any(alive(row.get(k)) for k in ('pid', 'childPid')):
            run_id = row.get('runId') or p.name.removesuffix('.queue.json').removesuffix('.pid.json').removesuffix('.json')
            active_ids.add(run_id)
            if row.get('name'):
                active_names.add(row['name'])
            for key in ('briefPath', 'reportPath', 'resultPath', 'logPath', 'brief', 'body', 'report', 'questions'):
                if isinstance(row.get(key), str) and row[key].startswith('/'):
                    protected.add(Path(row[key]))
    # A brief's metadata and body belong to its active run, even if older than the run.
    for p, row in rows:
        brief = row.get('briefPath') or row.get('brief')
        if not isinstance(brief, str) or not brief.startswith('/'):
            brief = None
        if row.get('name') in active_names or (brief and Path(brief) in protected):
            protected.add(p)
            if brief and isinstance(brief, str):
                protected.add(Path(brief))
            for key in ('report', 'body', 'questions'):
                if isinstance(row.get(key), str) and row[key].startswith('/'):
                    protected.add(Path(row[key]))
    for p in list(protected):
        if p.name.endswith('.md') and p.is_file() and not p.is_symlink():
            for report in re.findall(r'^REPORT:\s*(/.+)$', p.read_text(), re.M):
                protected.add(Path(report.strip()))
    approved = [Path(p).absolute() for p in (include_backups or [])]
    def included(p):
        return any(p.absolute() == a or a in p.absolute().parents for a in approved)
    docs = document_references(run_files + report_files)
    pending = []
    for p in run_files + report_files:
        if sensitive(p) and not included(p):
            st = p.lstat()
            origin = next((row.get('name') or row.get('runId') for q, row in rows if row.get('runId') and p.name.startswith(row['runId'])), None)
            origin = origin or next((row.get('name') for _, row in rows if row.get('name') and p.name.startswith(row['name'] + '.')), None)
            pending.append({'path': str(p), 'bytes': st.st_size, 'modifiedAt': datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat(), 'taskOrProject': origin or '未知（目录：' + str(p.parent) + '）', 'referencedBy': referenced_by(p, docs), 'referenceScope': 'runs 与报告目录内 Markdown；未发现引用不代表无用', 'usefulness': '无法自动判断无用，需主线程核实并取得用户同意'})
    for item in skipped:
        if item['reason'].startswith('待确认') and not included(Path(item['path'])):
            p = Path(item['path'])
            pending.append({'path': str(p), 'bytes': 0, 'modifiedAt': datetime.datetime.fromtimestamp(p.lstat().st_mtime, datetime.timezone.utc).isoformat(), 'taskOrProject': '未知（空目录）', 'referencedBy': referenced_by(p, docs), 'referenceScope': 'runs 与报告目录内 Markdown', 'usefulness': '空证据/备份目录，需主线程核实并取得用户同意'})
    def active(p):
        return any(p == q or q in p.parents for q in protected) or any(part == i or part.startswith(i + '.') for i in active_ids for part in p.parts)
    def eligible(p):
        if sensitive(p) and not included(p):
            return False
        if p.name in PRESERVE or p.name.startswith('.env') or p.name.endswith('.env') or p.name.startswith('.queue-lock'):
            skipped.append({'path': str(p), 'reason': 'preserved'})
            return False
        if active(p) or any(q.name == '.queue-lock' for q in p.parents):
            skipped.append({'path': str(p), 'reason': 'active run'})
            return False
        if p.lstat().st_mtime >= cutoff:
            skipped.append({'path': str(p), 'reason': 'recent'})
            return False
        return True
    # Only registered fleet worktrees are considered; a pushed branch alone is not merged.
    seen = set()
    for p, row in rows:
        wt = row.get('worktree')
        if not isinstance(wt, dict) or row.get('worktree_location', 'local') != location:
            continue
        target = Path(wt.get('path', ''))
        if str(target) in seen or not target.is_dir():
            continue
        seen.add(str(target))
        try:
            if row.get('name') in active_names or active(p):
                raise ValueError('active run')
            if target.is_symlink() or target.stat().st_mtime >= cutoff:
                raise ValueError('recent worktree')
            if git(target, 'status', '--porcelain', '--untracked-files=all'):
                raise ValueError('dirty worktree')
            if git(target, 'symbolic-ref', '--short', 'HEAD') != wt['branch']:
                raise ValueError('worktree branch changed')
            base = wt.get('base')
            if not base or git(target, 'rev-parse', '--path-format=absolute', '--git-common-dir') != git(wt['repo'], 'rev-parse', '--path-format=absolute', '--git-common-dir'):
                raise ValueError('unknown base/repository')
            git(target, 'merge-base', '--is-ancestor', 'HEAD', base)
            children = files(target, [])
            protected_children = [c for c in target.rglob('*') if sensitive(c) and not included(c)]
            if (sensitive(target) and not included(target)) or protected_children:
                for c in protected_children or [target]:
                    st = c.lstat()
                    pending.append({'path': str(c), 'bytes': st.st_size if not c.is_dir() else sum(f.lstat().st_size for f in children if c in f.parents), 'modifiedAt': datetime.datetime.fromtimestamp(st.st_mtime, datetime.timezone.utc).isoformat(), 'taskOrProject': row.get('name') or str(target), 'referencedBy': referenced_by(c, docs), 'referenceScope': 'runs 与报告目录内 Markdown；未发现引用不代表无用', 'usefulness': '无法自动判断无用，需主线程核实并取得用户同意'})
                raise ValueError('待确认：证据/备份')
            if any(c.lstat().st_mtime >= cutoff for c in children):
                raise ValueError('recent worktree files')
            count = len(children)
            size = sum(c.lstat().st_size for c in children)
            if not dry_run:
                git(wt['repo'], 'worktree', 'remove', str(target))
                git(wt['repo'], 'branch', '-D', wt['branch'])
            worktrees.append({'path': str(target), 'files': count, 'bytes': size})
        except (ValueError, KeyError, subprocess.CalledProcessError) as e:
            protected.add(p)
            skipped.append({'path': str(target), 'reason': str(e) if not isinstance(e, subprocess.CalledProcessError) else 'not merged or git refused'})
    locations = []
    for root, entries in [(runs, run_files), (reports, report_files)]:
        count, size = 0, 0
        for p in entries:
            if eligible(p):
                size += p.lstat().st_size
                count += 1
                deleted.append(str(p))
                if not dry_run:
                    p.unlink()
        if not dry_run and root.exists() and not root.is_symlink():
            for directory, _, _ in os.walk(root, topdown=False, followlinks=False):
                d = Path(directory)
                if d == root or (sensitive(d) and not included(d)) or active(d):
                    continue
                if d.lstat().st_mtime < cutoff or re.fullmatch(r'\d{4}-\d{2}-\d{2}', d.name):
                    try:
                        d.rmdir()
                    except OSError:
                        pass
        locations.append({'path': str(root), 'files': count, 'bytes': size})
    return {'dryRun': dry_run, 'olderThan': older_than, 'locations': locations, 'worktrees': worktrees,
            'files': sum(r['files'] for r in locations + worktrees), 'bytes': sum(r['bytes'] for r in locations + worktrees),
            'pendingConfirmation': pending, 'skipped': skipped, 'activeNames': sorted(active_names)}


def command(args):
    import mini
    age_seconds(args.older_than)
    local_approved = [str(Path(p.removeprefix('local:')).expanduser().absolute()) for p in args.include_backups if not p.startswith('mini:')]
    remote_approved = [p.removeprefix('mini:') for p in args.include_backups if p.startswith('mini:')]
    preview = clean_local(args.older_than, True, peer_active_names=[], include_backups=local_approved)
    peer_names = None
    remote = None
    error = None
    if mini.REMOTE_HOME and mini.REMOTE_BIN:
        script = mini.PATH_FIX + Path(__file__).read_text() + '\nimport base64,sys\np=json.loads(base64.b64decode(sys.argv[1]));print(json.dumps(clean_local(**p),ensure_ascii=False))'
        try:
            result = mini.call(script, {'older_than': args.older_than, 'dry_run': args.dry_run, 'home': mini.REMOTE_HOME, 'location': 'mini', 'peer_active_names': preview['activeNames'], 'include_backups': remote_approved}, timeout=600)
            if result.returncode:
                raise ValueError('Mini 清理失败，退出码：' + str(result.returncode))
            remote = json.loads(result.stdout)
            peer_names = remote['activeNames']
        except (OSError, ValueError, subprocess.TimeoutExpired) as e:
            error = type(e).__name__ + '：Mini 未完成，保留本机的 Mini 任务关联文件'
    print(json.dumps({'location': 'local', **clean_local(args.older_than, args.dry_run, peer_active_names=peer_names, include_backups=local_approved)}, ensure_ascii=False))
    if remote is not None:
        print(json.dumps({'location': 'mini', **remote}, ensure_ascii=False))
    else:
        print(json.dumps({'location': 'mini', 'skipped': error or 'Mini 未配置 remote_home/bin'}, ensure_ascii=False))
    if error:
        raise ValueError(error)
