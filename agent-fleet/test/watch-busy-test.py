"""Lock contention must not terminate the watcher or starve dispatch."""
import contextlib
import io
from pathlib import Path
import runpy
import sqlite3
import sys
from unittest.mock import patch

watch = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'bin/fleet-watch.py'))
main = watch['main']
g = main.__globals__
class DB:
    def __init__(self): self.rollbacks = 0
    def execute(self, query): pass
    def rollback(self): self.rollbacks += 1
    def close(self): pass

def busy():
    error = sqlite3.OperationalError('database is locked')
    error.sqlite_errorcode = 5
    raise error

def scenario(blocked):
    db = DB()
    calls = []
    def reconcile(*args):
        calls.append('reconcile')
        if blocked == 'reconcile': busy()
        return {}
    def patrol(*args):
        calls.append('patrol')
        if blocked == 'patrol': busy()
        return {}
    def dispatch(*args):
        calls.append('dispatch')
        raise StopIteration
    store = {'connect': lambda: db, 'runs_root': lambda: Path('/tmp')}
    with patch.dict(g, {'store': store, 'reconcile': reconcile, 'patrol': patrol,
                        'wake_legacy_review_parks': lambda *a: None, 'dispatch': dispatch}), \
         patch.object(sys, 'argv', ['fleet-watch', '--dispatch']), contextlib.redirect_stderr(io.StringIO()) as err:
        try: main()
        except StopIteration: pass
    assert calls.count(blocked) == 2, calls
    assert calls[-1] == 'dispatch', calls
    assert db.rollbacks == 2
    assert 'WARN:' in err.getvalue()

scenario('reconcile')
scenario('patrol')
print('PASS bounded reconcile and patrol contention; dispatch proceeds')

# Errors other than SQLITE_BUSY must reach the caller unchanged.
def verify_propagates(error):
    db = DB()
    def fail(): raise error
    try:
        watch['bounded_busy'](db, 'fixture', fail)
    except Exception as caught:
        assert caught is error
    else:
        raise AssertionError('exception was swallowed')
    assert db.rollbacks == 0

non_busy = sqlite3.OperationalError('database is corrupt')
non_busy.sqlite_errorcode = 11
verify_propagates(non_busy)
verify_propagates(ValueError('fixture'))
print('PASS non-busy database and non-database errors propagate')
