---
"codeowners-git": minor
---

Add `--dry-run` and `--json` flags for all major commands

### New Features

- **`--dry-run` flag** — Available on `branch`, `multi-branch`, and `extract` commands. Shows a complete preview of what would happen (files, branches, commit messages, settings) without performing any git operations.

- **`--json` flag** — Available on `list`, `branch`, `multi-branch`, and `extract` commands. Outputs machine-readable JSON to stdout and suppresses all human-readable log messages. Works with both normal execution and `--dry-run` mode.

### Details

- **`list --json`**: Outputs `{ command, files, filters }` or `{ command, grouped, filters }` when used with `--group`
- **`branch --dry-run`**: Shows owner, branch name, branch existence, commit message, matched/excluded files, and push/PR/flag settings
- **`branch --json`**: Outputs branch result with success status, files, push state, and PR info
- **`multi-branch --dry-run`**: Shows per-owner breakdown (branch, message, files), uncovered files, unowned files, and summary totals
- **`multi-branch --json`**: Outputs aggregate results with per-owner success/failure details
- **`extract --dry-run`**: Shows source, compare target, files to extract, excluded files, and filter settings
- **`extract --json`**: Outputs extracted file list and source metadata
- Silent mode suppresses all `console.log/warn/error` output when `--json` is active; JSON is written via saved original `console.log`
- `pushBranch` in `git.ts` supports a `silent` option to switch `stdio` from `"inherit"` to `"pipe"`, preventing output leaks during JSON mode
- `recover` command is intentionally excluded from both flags (interactive with prompts)
