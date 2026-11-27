import runpy
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

watch = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'bin/fleet-watch.py'))
with TemporaryDirectory() as temp:
    root = Path(temp)
    artifacts = root / 'artifacts'
    artifacts.mkdir()
    (artifacts / 'report.txt').write_text('ok')
    nested = artifacts / 'node_modules'
    nested.mkdir()
    (nested / 'ignored.txt').write_text('dependency')
    state = {'artifactDir': str(artifacts), 'artifacts': [str(nested / 'ignored.txt')]}
    with patch.object(Path, 'rglob', side_effect=AssertionError('recursive traversal forbidden')):
        result = watch['evidence_summary'](root, 'example', state, {}, {}, {}, {})
    assert result['artifactCount'] == 2, result
print('PASS patrol bounded scan and explicit nested artifact')
import json
import sqlite3
from datetime import datetime, timezone
with TemporaryDirectory() as temp:
    root = Path(temp)
    db = sqlite3.connect(':memory:')
    db.row_factory = sqlite3.Row
    db.execute('CREATE TABLE runs (id TEXT, state TEXT)')
    db.execute("INSERT INTO runs VALUES ('maker', 'parked')")
    (root / 'maker.json').write_text(json.dumps({'name':'work'}))
    (root / 'maker.yield').write_text(json.dumps({'until':'review','at':1000}))
    (root / 'maker.asks').write_text(json.dumps({'kind':'review','at':'2026-01-01T00:00:00Z'})+'\n')
    (root / 'rv.brief.json').write_text(json.dumps({'review':True,'for':'work'}))
    rv = {'detach': True, 'runId':'fixture-detach-rv', 'startedAt':'2026-01-01T00:00:01Z', 'briefPath':str(root/'rv.brief.md'), 'status':'running'}
    (root / 'fixture-detach-rv.json').write_text(json.dumps(rv))
    now = datetime.now(timezone.utc).timestamp()
    watch['wake_legacy_review_parks'](db, root, now)
    assert not (root/'maker.wake.json').exists()
    rv['status'] = 'done'
    (root / 'fixture-detach-rv.json').write_text(json.dumps(rv))
    watch['wake_legacy_review_parks'](db, root, now)
    wake = json.loads((root/'maker.wake.json').read_text())
    assert wake['condition'] == 'review' and wake['status'] == 'done' and wake['reviewRunId'] == rv['runId']
print('PASS pinned supervisor review wake')
