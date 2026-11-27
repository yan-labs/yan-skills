"""Pure GCP pool decisions; callers supply authoritative worker and queue state.

No cloud actions are performed here.  A worker is eligible for stop only when
its lease inventory is known, empty, and its idle timestamp is trustworthy.
"""
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class Worker:
    name: str
    status: str
    active_leases: Optional[int] = None
    idle_since: Optional[float] = None
    managed: bool = False


@dataclass(frozen=True)
class PoolDecision:
    start: tuple[str, ...]
    create: int
    stop: tuple[str, ...]


def plan_pool(workers: list[Worker], queued: int, slots_per_worker: int,
              max_workers: int, now: float, idle_seconds: float = 1800) -> PoolDecision:
    if queued < 0 or slots_per_worker < 1 or max_workers < 0 or idle_seconds < 0:
        raise ValueError('invalid pool capacity or time')
    if len({w.name for w in workers}) != len(workers):
        raise ValueError('duplicate worker name')
    owned = [w for w in workers if w.managed]
    if any(w.active_leases is not None and w.active_leases < 0 for w in owned):
        raise ValueError('negative lease count')
    # Unknown leases consume the entire worker: assuming free capacity can
    # oversubscribe or stop another run after a controller restart.
    live = [w for w in owned if w.status in ('RUNNING', 'PROVISIONING', 'STAGING')]
    free = sum(max(0, slots_per_worker - w.active_leases)
               if w.status == 'RUNNING' and w.active_leases is not None
               else (slots_per_worker if w.status in ('PROVISIONING', 'STAGING') else 0)
               for w in live)
    shortfall = max(0, queued - free)
    needed = (shortfall + slots_per_worker - 1) // slots_per_worker
    room = max(0, max_workers - len(live))
    startable = sorted((w for w in owned if w.status == 'TERMINATED'), key=lambda w: w.name)
    start = tuple(w.name for w in startable[:min(needed, room)])
    # Existing transitional workers count against the cap, but terminated
    # workers also occupy a managed instance identity; prefer reusing them.
    create = min(max(0, needed - len(start)), max(0, room - len(start)),
                 max(0, max_workers - len(owned)))
    stop = ()
    if queued == 0:
        stop = tuple(sorted(w.name for w in owned if w.status == 'RUNNING'
                            and w.active_leases == 0 and w.idle_since is not None
                            and 0 <= w.idle_since <= now
                            and now - w.idle_since >= idle_seconds))
    return PoolDecision(start, create, stop)


def choose_workspace(requested: Optional[str], *, pool: str, gcp_enabled: bool) -> str:
    """Default coding workspaces to GCP; unavailability never silently falls back."""
    if pool not in ('code', 'light'):
        raise ValueError('invalid pool')
    if requested not in (None, 'local', 'gcp'):
        raise ValueError('invalid workspace')
    target = requested or ('gcp' if pool == 'code' else 'local')
    if target == 'gcp' and not gcp_enabled:
        raise RuntimeError('GCP workspace unavailable; explicit local exception required')
    return target
