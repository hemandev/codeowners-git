---
"codeowners-git": major
---

list and recover command enhancements

### Breaking Changes

- **`list` command**: Removed `-o, --owner` flag - use `--include` instead for owner filtering
- **`branch` command**: Renamed `-o, --owner` to `-i, --include` for consistency with other commands
- **`extract` command**: Renamed `-o, --owner` to `-i, --include` for consistency with other commands
- **Path patterns**: Changed from comma-separated to micromatch brace expansion syntax
  - Before: `packages,apps` (comma-separated)
  - After: `{packages,apps}` (brace expansion)

### New Features

- **`list` command**: Added `[pattern]` positional argument for path filtering (consistent with `branch` and `multi-branch`)
- **`list` command**: Added `--group, -g` flag to group files by code owner
- **`list`, `branch`, `multi-branch`, `extract` commands**: Added `--exclusive, -e` flag to only include files where the owner is the sole owner (excludes co-owned files)
- **`list`, `branch`, `multi-branch`, `extract` commands**: Added `--co-owned, -c` flag to only include files with multiple owners (co-owned files)
- **`extract` command**: Added `[pattern]` positional argument for path filtering (consistent with other commands)
- **Path patterns**: Full micromatch/glob syntax support including `*`, `**`, `?`, `[...]`, `{...}`
