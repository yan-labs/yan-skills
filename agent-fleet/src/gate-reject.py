"""Append sanitized dispatch rejections. Also used by the launcher and queue."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys


def path():
    return Path(os.environ.get('AGENT_FLEET_GATE_REJECTS') or Path.home() / '.agent-fleet/gate-rejects.jsonl')


def record(attempt, stage, category, name, reason):
    try:
        redactor = Path(__file__).resolve().parents[1] / 'bin/redact'
        sanitized = subprocess.run([str(redactor)], input=str(reason), capture_output=True, text=True, check=True).stdout
        row = {'attemptId': attempt, 'stage': stage, 'category': category, 'name': name,
               'date': datetime.date.today().isoformat(), 'reason': sanitized.strip()[:2000]}
        dest = path()
        dest.parent.mkdir(parents=True, exist_ok=True)
        with dest.open('a') as out:
            out.write(json.dumps(row, ensure_ascii=False) + '\n')
    except (OSError, subprocess.SubprocessError):
        pass


if __name__ == '__main__':
    record(*sys.argv[1:], sys.stdin.read())
