# codeowners-git

[![Release](https://github.com/hemandev/codeowners-git/actions/workflows/release.yml/badge.svg)](https://github.com/hemandev/codeowners-git/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/codeowners-git)](https://www.npmjs.com/package/codeowners-git)
[![license](https://img.shields.io/npm/l/codeowners-git)](LICENSE)

Managing large-scale migrations in big monorepos with multiple codeowners can be overwhelming. Massive PRs touching thousands of files make it hard for teams to review changes efficiently.

`codeowners-git` (or `cg` for short) solves this by:

- Identifying files owned by specific teams using the CODEOWNERS file.
- Creating compact, team-specific branches with only their affected files.
- Streamlining the review process with smaller, targeted PRs.
- **Graceful error handling** with automatic recovery from failures.

> ❗❗ ❗ **Note:** Starting from v2.0.0, this tool works with **staged files**. Stage your changes with `git add` before running commands.

https://github.com/user-attachments/assets/7cc0a924-f03e-47f3-baad-63eca9e8e4a8

## Installation

### Using npx (recommended)

Run commands directly without installation:

```bash
npx codeowners-git <command>
```

### Install globally via npm

```bash
npm install -g codeowners-git
```

Then run commands directly:

```bash
codeowners-git <command>
# or use the short alias
cg <command>
```

## Configuration

The tool automatically detects CODEOWNERS files in:

1. `.github/CODEOWNERS`
2. `docs/CODEOWNERS`
3. `CODEOWNERS` (root directory)

### Pull Request Features

The `--pr` and `--draft-pr` options require the [GitHub CLI (`gh`)](https://cli.github.com/) to be installed and authenticated:

```bash
# Install GitHub CLI (macOS)
brew install gh

# Install GitHub CLI (Windows)
winget install --id GitHub.cli

# Install GitHub CLI (Linux)
sudo apt install gh

# Authenticate with GitHub
gh auth login
```

The tool will automatically:

- Use PR templates if they exist in your repository (`.github/pull_request_template.md`, etc.)
- Set the PR title to your commit message
- Create PRs against the repository's default branch

### Owner Pattern Matching

The `--include` and `--ignore` options support glob patterns for flexible owner filtering:

| Pattern      | Description       | Example Match                      |
| ------------ | ----------------- | ---------------------------------- |
| `@org/team`  | Exact match       | `@org/team` only                   |
| `*team`      | Ends with         | `@org/team`, `@company/team`       |
| `@org/*`     | Starts with (org) | `@org/team-a`, `@org/team-b`       |
| `*ce-*`      | Contains          | `@org/ce-orca`, `@company/ce-team` |
| `*orca,*rme` | Multiple patterns | Either pattern matches             |

**Key behavior:**

- `*` matches any character **including `/`** (slashes are normalized)
- `*/ce-orca` and `*ce-orca` behave identically
- Patterns are case-sensitive
- Multiple patterns can be comma-separated

### Path Pattern Matching

Path patterns use [micromatch](https://github.com/micromatch/micromatch) syntax:

| Pattern                 | Description                    | Example Match                                   |
| ----------------------- | ------------------------------ | ----------------------------------------------- |
| `src`                   | Directory (auto-appends `/**`) | All files in `src/`                             |
| `src/`                  | Directory with trailing slash  | All files in `src/`                             |
| `**/*.ts`               | Glob pattern                   | All `.ts` files                                 |
| `{src,docs}`            | Brace expansion                | Files in `src/` or `docs/`                      |
| `packages/{a,b}/**`     | Combined                       | Files in `packages/a/` or `packages/b/`         |
| `packages/**/{foo,bar}` | Nested braces                  | Directories named `foo` or `bar` under packages |

**Key behavior:**

- Directories without glob chars automatically match all files inside (`src` → `src/**`)
- Use brace expansion `{a,b}` for multiple patterns (not comma-separated)
- Supports full micromatch/glob syntax: `*`, `**`, `?`, `[...]`, `{...}`

## Commands

### `--version`

Display the version of codeowners-git.

Usage:

```bash
codeowners-git --version
# or
codeowners-git -V
# or using the short alias
cg --version
```

### `list`

List changed files with their CODEOWNERS.

Usage:

```bash
codeowners-git list [pattern] [options]
# or
cg list [pattern] [options]
```

Arguments:

- `[pattern]` Optional path pattern to filter files (micromatch syntax)

Options:

- `--include, -i` Filter by owner patterns (glob syntax)
- `--group, -g` Group files by code owner
- `--exclusive, -e` Only include files with a single owner (no co-owned files)
- `--co-owned, -c` Only include files with multiple owners (co-owned files)

Examples:

```bash
# List all changed files with owners
cg list

# Filter by path pattern
cg list src/
cg list "packages/{basics,shared}/**"

# Filter by owner pattern
cg list --include "*ce-*"

# Group output by owner
cg list --group

# Combine filters
cg list "packages/" --include "@myorg/*" --group

# List only files with a single owner (exclude co-owned files)
cg list --exclusive

# List only files where @myteam is the sole owner
cg list --include "@myteam" --exclusive

# List only co-owned files (files with multiple owners)
cg list --co-owned

# List co-owned files where @myteam is one of the owners
cg list --include "@myteam" --co-owned
```

### `branch`

Create a branch with changes owned by a specific codeowner.

Usage:

```bash
codeowners-git branch [pattern] [options]
# or
cg branch [pattern] [options]
```

Arguments:

- `[pattern]` Optional path pattern to filter files (micromatch syntax). Examples: `packages`, `**/*.tsx`, `{packages,apps}`

Options:

- `--include, -i` Code owner pattern to filter files (supports glob patterns like `*team`, `@org/*`)
- `--branch, -b` Specify branch pattern
- `--message, -m` Commit message for changes
- `--no-verify, -n` Skips lint-staged and other checks before committing
- `--push, -p` Push branch to remote after commit
- `--remote, -r` Remote name to push to (default: "origin")
- `--upstream, -u` Upstream branch name (defaults to local branch name)
- `--force, -f` Force push to remote
- `--keep-branch-on-failure, -k` Keep the created branch even if operation fails
- `--append` Add commits to existing branch instead of creating a new one
- `--pr` Create a pull request after pushing (requires `--push` and GitHub CLI)
- `--draft-pr` Create a draft pull request after pushing (requires `--push` and GitHub CLI)
- `--exclusive, -e` Only include files where the owner is the sole owner (no co-owned files)
- `--co-owned, -c` Only include files with multiple owners (co-owned files)

Example:

```bash
# Create a new branch with all files owned by @myteam
cg branch -i @myteam -b "feature/new-feature" -m "Add new feature" -p

# Filter to only files in the packages directory
cg branch "packages" -i @myteam -b "feature/packages" -m "Update packages" -p

# Filter with glob pattern (only .tsx files)
cg branch "**/*.tsx" -i @myteam -b "feature/tsx" -m "Update tsx files" -p

# Filter multiple directories (brace expansion)
cg branch "{packages,apps}" -i @myteam -b "feature/update" -m "Update packages and apps" -p

# Create a branch and automatically create a pull request
cg branch -i @myteam -b "feature/new-feature" -m "Add new feature" -p --pr

# Create a branch and automatically create a draft pull request
cg branch -i @myteam -b "feature/new-feature" -m "Add new feature" -p --draft-pr

# Add more commits to the same branch later
cg branch -i @myteam -b "feature/new-feature" -m "Add more changes" --append -p

# Use glob patterns to match multiple teams
cg branch -i "*ce-*" -b "feature/ce-teams" -m "Changes for CE teams" -p

# Match all teams in an organization
cg branch -i "@myorg/*" -b "feature/org-changes" -m "Org-wide changes" -p

# Match multiple specific patterns
cg branch -i "*orca,*rme" -b "feature/specific-teams" -m "Targeted changes" -p

# Only include files where @myteam is the sole owner (exclude co-owned files)
cg branch -i @myteam -b "feature/exclusive" -m "Team exclusive changes" -p --exclusive

# Only include co-owned files where @myteam is one of the owners
cg branch -i @myteam -b "feature/co-owned" -m "Co-owned changes" -p --co-owned
```

### `multi-branch`

Create branches for all codeowners with changes.

Usage:

```bash
codeowners-git multi-branch [pattern] [options]
# or
cg multi-branch [pattern] [options]
```

Arguments:

- `[pattern]` Optional path pattern to filter files (micromatch syntax). Examples: `packages`, `**/*.tsx`, `{packages,apps}`

Options:

- `--branch, -b` Base branch name (will be suffixed with codeowner name)
- `--message, -m` Base commit message (will be suffixed with codeowner name)
- `--no-verify, -n` Skips lint-staged and other checks before committing
- `--push, -p` Push branches to remote after commit
- `--remote, -r` Remote name to push to (default: "origin")
- `--upstream, -u` Upstream branch name pattern (defaults to local branch name)
- `--force, -f` Force push to remote
- `--keep-branch-on-failure, -k` Keep created branches even if operation fails
- `--default-owner, -d` Default owner to use when no codeowners are found for changed files
- `--ignore` Glob patterns to exclude codeowners (e.g., `*team-a`, `@org/*`)
- `--include` Glob patterns to include codeowners (e.g., `*ce-*`, `@org/*`)
- `--append` Add commits to existing branches instead of creating new ones
- `--pr` Create pull requests after pushing (requires `--push` and GitHub CLI)
- `--draft-pr` Create draft pull requests after pushing (requires `--push` and GitHub CLI)
- `--exclusive, -e` Only include files where each owner is the sole owner (no co-owned files)
- `--co-owned, -c` Only include files with multiple owners (co-owned files)

> **Note:** You cannot use both `--ignore` and `--include` options at the same time. You also cannot use both `--exclusive` and `--co-owned` options at the same time.

Example:

```bash
# Create branches for all codeowners
cg multi-branch -b "feature/new-feature" -m "Add new feature" -p

# Filter to only files in the packages directory
cg multi-branch "packages" -b "feature/packages" -m "Update packages" -p

# Filter with glob pattern (only .tsx files)
cg multi-branch "**/*.tsx" -b "feature/tsx" -m "Update tsx files" -p

# Filter multiple directories (brace expansion)
cg multi-branch "{packages,apps}" -b "feature/update" -m "Update" -p

# Create branches and automatically create pull requests for each
cg multi-branch -b "feature/new-feature" -m "Add new feature" -p --pr

# Create branches and automatically create draft pull requests for each
cg multi-branch -b "feature/new-feature" -m "Add new feature" -p --draft-pr

# Exclude specific teams using glob patterns
cg multi-branch -b "feature/new-feature" -m "Add new feature" --ignore "*ce-orca,*ce-ece"

# Exclude all teams in an organization
cg multi-branch -b "feature/new-feature" -m "Add new feature" --ignore "@excluded-org/*"

# Include only teams matching a pattern
cg multi-branch -b "feature/new-feature" -m "Add new feature" --include "*ce-*"

# Include only specific organization
cg multi-branch -b "feature/new-feature" -m "Add new feature" --include "@myorg/*"

# Use default owner when no codeowners found
cg multi-branch -b "feature/new-feature" -m "Add new feature" -d "@default-team"

# Add more commits to existing branches
cg multi-branch -b "feature/new-feature" -m "Add more changes" --append -p

# Only include files where each owner is the sole owner (exclude co-owned files)
cg multi-branch -b "feature/exclusive" -m "Exclusive changes" -p --exclusive

# Only include co-owned files
cg multi-branch -b "feature/co-owned" -m "Co-owned changes" -p --co-owned
```

This will:

1. Find all codeowners for the staged files
2. Apply any ignore/include filters if specified
3. For each codeowner (e.g., @team-a, @team-b):
   - Create a branch like `feature/new-feature/team-a`
   - Commit only the files owned by that team
   - Add a commit message like "Add new feature - @team-a"
   - Push each branch to the remote if the `-p` flag is provided

### `extract`

Extract file changes from a source branch or commit to your working directory. This is useful when you want to copy changes from another branch to review and then stage them for committing using the `branch` command.

Usage:

```bash
codeowners-git extract [pattern] [options]
# or
cg extract [pattern] [options]
```

Arguments:

- `[pattern]` Optional path pattern to filter files (micromatch syntax). Examples: `packages`, `**/*.tsx`, `{packages,apps}`

Options:

- `--source, -s` **(required)** Source branch or commit to extract from
- `--include, -i` Filter extracted files by code owner (supports glob patterns like `*team`, `@org/*`)
- `--compare-main` Compare source against main branch instead of detecting merge-base
- `--exclusive, -e` Only include files where the owner is the sole owner (no co-owned files)
- `--co-owned, -c` Only include files with multiple owners (co-owned files)

Examples:

```bash
# Extract all changes from a branch (files will be unstaged in working directory)
cg extract -s feature/other-team

# Extract only specific owner's files
cg extract -s feature/other-team -i "@my-team"

# Extract using glob patterns
cg extract -s feature/other-team -i "*ce-*"
cg extract -s feature/other-team -i "@myorg/*"

# Extract from a commit hash
cg extract -s abc123def

# Extract comparing against main (instead of detecting merge-base)
cg extract -s feature/long-running --compare-main

# Filter by path pattern
cg extract "packages/" -s feature/other-team
cg extract "{packages,apps}" -s feature/other-team -i "@my-team"

# Extract only files where owner is the sole owner (no co-owned files)
cg extract -s feature/other-team -i "@my-team" --exclusive

# Extract only co-owned files (files with multiple owners)
cg extract -s feature/other-team --co-owned

# Extract co-owned files where @my-team is one of the owners
cg extract -s feature/other-team -i "@my-team" --co-owned
```

> **Note:** Files are extracted to your working directory (unstaged), allowing you to review and modify them. Stage the files with `git add`, then use the `branch` command to create a branch, commit, push, and create PRs.

### `recover`

Recover from failed or incomplete operations. When `branch` or `multi-branch` commands fail, the tool tracks the operation state and allows you to clean up and return to your original branch.

Usage:

```bash
codeowners-git recover [options]
# or
cg recover [options]
```

Options:

- `--list` List all incomplete operations
- `--id <operationId>` Recover specific operation by UUID
- `--keep-branches` Keep created branches instead of deleting them
- `--auto` Automatically recover most recent operation without prompts

Examples:

```bash
# List all incomplete operations
cg recover --list

# Automatically recover from most recent failure
cg recover --auto

# Recover specific operation
cg recover --id abc12345-6789-...

# Recover but keep the created branches
cg recover --id abc12345-6789-... --keep-branches
```

**When to use:**

- Operation failed due to network errors
- Process was interrupted (Ctrl+C)
- Push failed but branch was created
- Need to clean up after errors

**What it does:**

1. Returns to your original branch
2. Optionally deletes created branches (unless `--keep-branches`)
3. Cleans up state files

**How it works:**

Every `branch` and `multi-branch` operation is tracked with a unique UUID in your home directory (`~/.codeowners-git/state/`). If an operation fails, you'll see recovery instructions:

```bash
✗ Operation failed: Push failed with exit code 128

Recovery options:
  1. Run 'codeowners-git recover --id abc12345...' to clean up
  2. Run 'codeowners-git recover --id abc12345... --keep-branches' to keep branches
  3. Run 'codeowners-git recover --list' to see all incomplete operations
```

The tool automatically handles:

- Graceful shutdown on Ctrl+C (SIGINT/SIGTERM)
- State persistence across crashes
- Detailed operation tracking (branch creation, commits, pushes, PR creation)
- Clean recovery to original state

> **Note:** State files are stored in `~/.codeowners-git/state/` outside your project directory, so no `.gitignore` entries are needed.

## Contributing

1. Clone the repository
2. Install dependencies:

```bash
bun install
```

3. Make your changes
4. Run tests:

```bash
bun test
```

5. Submit a pull request

## Alternatives

[@snyk/github-codeowners](https://github.com/snyk/github-codeowners)

[codeowners](https://github.com/beaugunderson/codeowners)

## License

MIT ©
