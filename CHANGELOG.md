# codeowners-git

## 1.8.0

### Minor Changes

- fca1a4d: Add graceful error handling with state tracking and recovery

  This release introduces a comprehensive error handling system that prevents users from being stuck in a limbo state when operations fail:

  **New Features:**

  - **State Tracking**: Every operation is tracked with a unique UUID in `~/.codeowners-git/state/` (user's home directory)
  - **Recovery Command**: New `recover` command to clean up and return to original state after failures
    - `recover --list`: List all incomplete operations
    - `recover --auto`: Automatically recover most recent operation
    - `recover --id <uuid>`: Recover specific operation
    - `recover --keep-branches`: Keep created branches during recovery
  - **Graceful Shutdown**: Signal handlers (SIGINT/SIGTERM) provide recovery instructions on interruption
  - **Enhanced Error Messages**: Clear recovery instructions shown when operations fail

  **Improvements:**

  - Operations tracked through all stages (creating-branch, committing, pushing, creating-pr)
  - Automatic cleanup on success (state files deleted)
  - Smart cleanup on failure (return to original branch, optional branch deletion)
  - State persists across crashes for reliable recovery
  - Detailed per-branch status tracking (created, committed, pushed, PR created, errors)

  **Breaking Changes:** None

  Users can now confidently recover from any error scenario (network failures, process crashes, user interruptions) using the new `recover` command.

- fca1a4d: Add `extract` command to copy file changes from source branches/commits

  New `extract` command allows you to:

  - Extract changed files from any branch or commit to your working directory (unstaged)
  - Filter extracted files by codeowner using micromatch patterns (`@team-*`)
  - Automatically detect merge-base or compare against main branch
  - Review and modify extracted files before committing

  Common workflow:

  ```bash
  # Extract files from another branch
  cg extract -s feature/other-team -o "@my-team"

  # Then use branch command to commit
  cg branch -o @my-team -b my-branch -m "Extracted changes" -p --pr
  ```

  This is useful for cherry-picking changes from colleague's branches or copying work between feature branches.

## 1.7.0

### Minor Changes

- 598ce89: fix --draft-pr when body is empty

## 1.6.0

### Minor Changes

- 41a5d2c: Add GitHub PR integration and CLI alias

  - Add `--pr` and `--draft-pr` flags to `branch` and `multi-branch` commands for automatic pull request creation
  - Integrate with GitHub API to create pull requests with customizable templates
  - Add `cg` as a convenient CLI alias alongside `codeowners-git`
  - Improve workflow automation for team-based code review processes

## 1.5.0

### Minor Changes

- 9be188f: - Add --append flag which allows reuse the same branch for further changes later

## 1.4.2

### Patch Changes

- ebfceed: fix: --defaultOwners not working correctly

## 1.4.1

### Patch Changes

- 9294ca6: fix version command

## 1.4.0

### Minor Changes

- 0291a67: Add --version command

## 1.3.0

### Minor Changes

- 3cd1fe6: - Support --include, --ignore, --default-owner for `multi-branch`
  - Fixed an issue where `multi-branch` exits in the middle when a file has no codeowners assigned to it or the codeowners has no files associated with it.

## 1.2.0

### Minor Changes

- 95c75be: Support `push` option to auto push changes to the remote branch
- 3d06276: New `multi-branch` command to create branches for all codeowners with changes
- 54ae678: Show output from git while pushing

## 1.1.0

### Minor Changes

- a639a0b: - Support for `--no-verify` in `branch` command

## 1.0.5

### Patch Changes

- 4870045: - Bump minimum npm version

## 1.0.4

### Patch Changes

- 1cdcc94: - Update branch command description

## 1.0.3

### Patch Changes

- 876f467: - Update list command description

## 1.0.2

### Patch Changes

- aafd5b0: - Updated command description

## 1.0.1

### Patch Changes

- 8279aca: - Update the width for `No` column in `list` command

## 1.0.0

### Major Changes

- 826bac9: Changelog

  1.0.0 - 2025-01-28

  Added

  - Initial release of `codeowners-git`, providing:
  - Ability to list CODEOWNERS for changed files using the list command.
  - Ability to create owner-specific branches using the branch command.
  - Automatic detection of CODEOWNERS files in .github/, docs/, or project root.
  - Support for filtering owners and patterns (--owner, --include), making large-scale monorepo changes more manageable.

  Other

  - Basic CI setup for testing with Bun.
  - CLI documentation in the README.
  - MIT License.
