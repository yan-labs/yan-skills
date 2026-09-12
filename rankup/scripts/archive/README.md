## aitdk-report.mjs (archived 2026-09-11)

This file is an archived AITDK extraction script that relied on Chrome's `--remote-debugging-port=9222`, requiring manual startup of Chrome in debug mode.

It has been superseded by `scripts/aitdk-opencli.sh`, which uses the opencli extension's `frames` + `eval --frame` approach and does not require special Chrome startup.

Retained for reference only.
