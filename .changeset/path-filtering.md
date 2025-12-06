---
"codeowners-git": minor
---

Add path filtering support for branch and multi-branch commands

- New optional `[pattern]` positional argument for `branch` and `multi-branch` commands
- Filter files using micromatch patterns (e.g., `packages`, `src/**/*.tsx`, `packages,apps`)
- Directory names automatically expand to include all files (e.g., `packages` → `packages/**`)
- Supports comma-separated patterns for multiple directories
