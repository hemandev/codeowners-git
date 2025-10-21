---
"codeowners-git": minor
---

Add graceful error handling with state tracking and recovery

This release introduces a comprehensive error handling system that prevents users from being stuck in a limbo state when operations fail:

**New Features:**
- **State Tracking**: Every operation is tracked with a unique UUID in `.codeowners-git/state/` directory
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
