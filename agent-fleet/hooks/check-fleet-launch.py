#!/usr/bin/env python3
"""Claude PreToolUse hook for Bash launches that would lose completion notices."""
import json
from pathlib import Path
import re
import runpy
import sys
import uuid

event = json.load(sys.stdin)
tool = event.get('tool_input') or {}
command = tool.get('command', '')
lines = command.splitlines()
launch = re.compile(r'(?:^|[;&]\s*)(?:nohup\s+|setsid\s+)?(?:\S*/)?(?:fleet-go\s+(?:new|relaunch)|fleet\s+(?:code|copy|bulk|grok-cli|grok|openai|haiku|sonnet|opus|fable|judge|run))\s+([^\s;&]+)')
match = next((m for line in lines if (m := launch.search(line))), None)
if match and not any(flag in match.string.split() for flag in ('--dry-run', '--no-launch', '--help')):
    if not tool.get('run_in_background') or re.search(r'\b(?:nohup|setsid|disown)\b|(?<![&>])&(?![&\d])', match.string):
        reason = '用 Bash 的 run_in_background 启动 fleet，移除 nohup、setsid、disown 和 &。'
        name = re.search(r'^[A-Za-z0-9][A-Za-z0-9_-]*$', match.group(1))
        record = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'src/gate-reject.py'))['record']
        record(str(uuid.uuid4()), 'launch-hook', 'background', name.group() if name and 'fleet-go' in match.group() else None, reason)
        print(json.dumps({'hookSpecificOutput': {'hookEventName': 'PreToolUse',
                                                 'permissionDecision': 'deny', 'permissionDecisionReason': reason}}))
