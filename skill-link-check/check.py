#!/usr/bin/env python3
"""Audit .agents/skills vs .claude/skills consistency at project and global scope."""
from __future__ import annotations

import os
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path


@dataclass
class Issue:
    kind: str
    name: str
    detail: str
    fix: str


@dataclass
class ScopeResult:
    label: str
    root: Path
    agents: Path
    claude: Path
    mode: str = ""
    issues: list[Issue] = field(default_factory=list)
    n_agents_skills: int = 0
    n_claude_entries: int = 0


def _children(p: Path) -> dict[str, Path]:
    out: dict[str, Path] = {}
    if not p.is_dir():
        return out
    for c in p.iterdir():
        if c.name.startswith("."):
            continue
        out[c.name] = c
    return out


def _describe(p: Path) -> str:
    if p.is_symlink():
        target = os.readlink(p)
        if not p.exists():
            return f"symlink → {target} (broken)"
        return f"symlink → {target}"
    if p.is_dir():
        return "real directory"
    if p.exists():
        return "exists but not a directory"
    return "not present"


def audit_scope(label: str, root: Path) -> ScopeResult | None:
    agents = root / ".agents" / "skills"
    claude = root / ".claude" / "skills"
    agents_present = agents.is_symlink() or agents.exists()
    claude_present = claude.is_symlink() or claude.exists()
    if not agents_present and not claude_present:
        return None

    res = ScopeResult(label=label, root=root, agents=agents, claude=claude)

    # Case: only .claude/skills exists. Every entry there is unbacked.
    if not agents_present:
        res.mode = "no-agents"
        for name, child in sorted(_children(claude).items()):
            res.issues.append(Issue(
                kind="orphan-in-claude",
                name=name,
                detail=f"{child} has no source under {agents} (which doesn't exist yet)",
                fix=(
                    f"mkdir -p {agents}\n"
                    f"  mv {child} {agents}/{name}\n"
                    f"  ln -s ../../.agents/skills/{name} {child}"
                ),
            ))
        return res

    # Case: only .agents/skills exists. Every skill lacks a link.
    if not claude_present:
        res.mode = "no-claude"
        agents_kids = _children(agents)
        res.n_agents_skills = len(agents_kids)
        for name in sorted(agents_kids):
            res.issues.append(Issue(
                kind="missing-link",
                name=name,
                detail=f"{agents}/{name} has no counterpart in {claude} (which doesn't exist yet)",
                fix=(
                    f"mkdir -p {claude}\n"
                    f"  ln -s ../../.agents/skills/{name} {claude}/{name}"
                ),
            ))
        return res

    # Both present.
    agents_kids = _children(agents)
    res.n_agents_skills = len(agents_kids)

    # Mode A: parent-level symlink — .claude/skills itself points at .agents/skills.
    if claude.is_symlink():
        try:
            target_resolved = claude.resolve(strict=True)
        except (FileNotFoundError, OSError):
            target_resolved = None
        if target_resolved == agents.resolve():
            res.mode = "parent-symlink"
            res.n_claude_entries = res.n_agents_skills
            return res
        res.mode = "parent-symlink-wrong-target"
        res.issues.append(Issue(
            kind="wrong-target",
            name="<.claude/skills>",
            detail=(
                f"{claude} → {os.readlink(claude)} "
                f"(expected to resolve to {agents})"
            ),
            fix=(
                f"rm {claude}\n"
                f"  ln -s {agents} {claude}"
            ),
        ))
        return res

    # Mode B: per-child symlinks under a real .claude/skills directory.
    res.mode = "per-child"
    claude_kids = _children(claude)
    res.n_claude_entries = len(claude_kids)

    for name in sorted(set(agents_kids) | set(claude_kids)):
        in_agents = name in agents_kids
        in_claude = name in claude_kids

        if in_agents and not in_claude:
            res.issues.append(Issue(
                kind="missing-link",
                name=name,
                detail=f"{agents}/{name} has no symlink in {claude}",
                fix=f"ln -s ../../.agents/skills/{name} {claude}/{name}",
            ))
            continue

        cpath = claude_kids[name]

        if in_claude and not in_agents:
            if cpath.is_symlink():
                target_str = os.readlink(cpath)
                if not cpath.exists():
                    res.issues.append(Issue(
                        kind="broken-symlink",
                        name=name,
                        detail=f"{cpath} → {target_str} (target missing, no source in .agents either)",
                        fix=f"rm {cpath}",
                    ))
                else:
                    res.issues.append(Issue(
                        kind="wrong-target",
                        name=name,
                        detail=(
                            f"{cpath} → {target_str} "
                            f"(resolves outside .agents/skills, and no {agents}/{name} exists)"
                        ),
                        fix=(
                            "# Decide whether to move the external target into .agents:\n"
                            f"  cp -R {cpath}/ {agents}/{name}\n"
                            f"  rm {cpath}\n"
                            f"  ln -s ../../.agents/skills/{name} {cpath}"
                        ),
                    ))
            else:
                res.issues.append(Issue(
                    kind="orphan-in-claude",
                    name=name,
                    detail=f"{cpath} is a real entry but {agents}/{name} does not exist",
                    fix=(
                        f"mv {cpath} {agents}/{name}\n"
                        f"  ln -s ../../.agents/skills/{name} {cpath}"
                    ),
                ))
            continue

        # Both sides have an entry.
        if cpath.is_symlink():
            target_str = os.readlink(cpath)
            try:
                resolved = cpath.resolve(strict=True)
            except (FileNotFoundError, OSError):
                resolved = None
            expected = (agents / name).resolve()
            if resolved is None:
                res.issues.append(Issue(
                    kind="broken-symlink",
                    name=name,
                    detail=f"{cpath} → {target_str} (broken)",
                    fix=(
                        f"rm {cpath}\n"
                        f"  ln -s ../../.agents/skills/{name} {cpath}"
                    ),
                ))
            elif resolved != expected:
                res.issues.append(Issue(
                    kind="wrong-target",
                    name=name,
                    detail=(
                        f"{cpath} → {target_str} "
                        f"(resolves to {resolved}, expected {expected})"
                    ),
                    fix=(
                        f"rm {cpath}\n"
                        f"  ln -s ../../.agents/skills/{name} {cpath}"
                    ),
                ))
        else:
            res.issues.append(Issue(
                kind="not-symlink",
                name=name,
                detail=f"{cpath} is a real entry, duplicating {agents}/{name}",
                fix=(
                    "# Inspect for divergence first, then collapse to a symlink:\n"
                    f"  diff -rq {cpath} {agents}/{name}\n"
                    f"  rm -rf {cpath}\n"
                    f"  ln -s ../../.agents/skills/{name} {cpath}"
                ),
            ))

    return res


def print_report(results: list[ScopeResult]) -> int:
    print("Skill link check")
    print("=" * 16)
    if not results:
        print("No .agents/skills or .claude/skills found at project or global scope.")
        return 0

    total = 0
    for r in results:
        print()
        print(f"[{r.label}] {r.root}")
        print(f"  .agents/skills: {_describe(r.agents)} ({r.agents})")
        print(f"  .claude/skills: {_describe(r.claude)} ({r.claude})")
        print(f"  Mode: {r.mode}")
        if r.mode == "parent-symlink":
            print(f"  ✓ {r.n_agents_skills} skills consistent (parent-symlink layout).")
            continue
        if not r.issues:
            print("  ✓ No issues.")
            continue
        kinds = Counter(i.kind for i in r.issues)
        summary = ", ".join(f"{n} {k}" for k, n in kinds.most_common())
        print(f"  ⚠ {len(r.issues)} issue(s): {summary}")
        for issue in r.issues:
            total += 1
            print(f"\n    [{issue.kind}] {issue.name}")
            print(f"      {issue.detail}")
            print(f"      Fix:")
            for line in issue.fix.splitlines():
                print(f"        {line}")

    print()
    if total:
        print(f"Total issues: {total}")
    else:
        print("All scopes look healthy.")
    return total


def main(argv: list[str]) -> int:
    project_root = Path.cwd()
    home = Path.home()

    results: list[ScopeResult] = []
    project_res = audit_scope("Project", project_root)
    if project_res is not None:
        results.append(project_res)

    # Don't double-report when cwd happens to be $HOME.
    if project_root.resolve() != home.resolve():
        global_res = audit_scope("Global", home)
        if global_res is not None:
            results.append(global_res)

    return 1 if print_report(results) else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
