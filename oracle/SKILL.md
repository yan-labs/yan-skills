---
name: oracle
description: "Send prompts + files to ChatGPT via Oracle browser automation for second-opinion reviews, debugging, and design checks."
---

# Oracle — ChatGPT second-opinion tool

Oracle bundles your prompt + selected files into one request and sends it to
ChatGPT via browser automation (no API key needed — uses your logged-in
Chrome session). Treat outputs as advisory: verify against the codebase + tests.

## Setup

Oracle is configured via `~/.oracle/config.json`:

```json
{
  "engine": "browser",
  "browserAttachRunning": true,
  "model": "专业",
  "browserModelStrategy": "current"
}
```

Chrome must be running with remote debugging port 9222 open.
`browserModelStrategy: "current"` skips model picker (use whatever's already selected in ChatGPT).
The ChatGPT UI is in Chinese; model labels: 极速, 均衡, 高级, 超高, 专业, GPT-5.5.

## Quick usage

```bash
# Ask a question with file context
oracle "Review this code for bugs" --file "src/**/*.ts" --file "!**/*.test.*"

# Preview token cost before sending (no tokens spent)
oracle --dry-run summary --files-report -p "Review this module" --file "src/**"

# Copy markdown bundle to clipboard for manual paste
oracle --render --copy -p "Review this" --file "src/**"
```

## When to use

- **Second opinion**: code review, architecture check, design review
- **Debugging**: send error + surrounding code for diagnosis
- **Refactoring**: ask for refactor suggestions with full file context
- **Cross-model comparison**: get a GPT perspective on a problem

## File attachment tips

- `--file "src/**"` — directory glob
- `--file src/index.ts` — single file
- `--file "!src/**/*.test.ts"` — exclude pattern (prefix with `!`)
- Auto-ignored: `node_modules`, `dist`, `.git`, `build`, `coverage`
- Budget: keep total input under ~196k tokens; use `--files-report` to check

## Prompt tips

Oracle starts with zero project knowledge. Always include:

- Project briefing (stack, build commands, constraints)
- Exact question + what you tried + error text
- Desired output format ("list options with tradeoffs", "return a patch plan")

## Sessions

- Stored under `~/.oracle/sessions/`
- Browser runs may take minutes; if CLI times out, reattach:
  - `oracle status` — list recent sessions
  - `oracle session <id>` — reattach to a session
- Use `--slug "my-review"` for readable session IDs

## Model override

```bash
# Use a different model for one run
oracle --model "GPT-5.5" "Complex architecture question" --file "src/**"
oracle --model "均衡" "Quick question" --file src/index.ts
```

## Safety

- Don't attach `.env`, key files, or auth tokens
- Redact secrets before sending
- Outputs are advisory — always verify against your codebase
