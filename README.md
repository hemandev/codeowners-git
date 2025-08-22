# codeowners-git

[![Release](https://github.com/hemandev/codeowners-git/actions/workflows/release.yml/badge.svg)](https://github.com/hemandev/codeowners-git/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/codeowners-git)](https://www.npmjs.com/package/codeowners-git)
[![license](https://img.shields.io/npm/l/codeowners-git)](LICENSE)

Managing large-scale migrations in big monorepos with multiple codeowners can be overwhelming. Massive PRs touching thousands of files make it hard for teams to review changes efficiently.

`codeowners-git` (or `cg` for short) solves this by:

- Identifying files owned by specific teams using the CODEOWNERS file.
- Creating compact, team-specific branches with only their affected files.
- Streamlining the review process with smaller, targeted PRs.

> **Note:** This tool works with **unstaged files**. Make sure to check if your files are unstaged before proceeding.

https://github.com/user-attachments/assets/7cc0a924-f03e-47f3-baad-63eca9e8e4a8

## Installation

### Using npx (recommended)

Run commands directly without installation:

```bash
npx codeowners-git <command>
# or use the short alias
npx cg <command>
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

List current CODEOWNERS entries.

Usage:

```bash
codeowners-git list [options]
# or
cg list [options]
```

Options:

- `--owner, -o` Filter by specific owner
- `--include, -i` Include specific patterns

Example:

```bash
codeowners-git list -o @myteam
# or
cg list -o @myteam
```

### `branch`

Manage branch permissions in CODEOWNERS file.

Usage:

```bash
codeowners-git branch [options]
# or
cg branch [options]
```

Options:

- `--owner, -o` Specify owner(s) to add/remove
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

Example:

```bash
# Create a new branch
codeowners-git branch -o @myteam -b "feature/new-feature" -m "Add new feature" -p
# or
cg branch -o @myteam -b "feature/new-feature" -m "Add new feature" -p

# Create a branch and automatically create a pull request
cg branch -o @myteam -b "feature/new-feature" -m "Add new feature" -p --pr

# Create a branch and automatically create a draft pull request
cg branch -o @myteam -b "feature/new-feature" -m "Add new feature" -p --draft-pr

# Add more commits to the same branch later
cg branch -o @myteam -b "feature/new-feature" -m "Add more changes" --append -p
```

### `multi-branch`

Create branches for all codeowners with changes.

Usage:

```bash
codeowners-git multi-branch [options]
# or
cg multi-branch [options]
```

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
- `--ignore` Comma-separated patterns to exclude codeowners (e.g., 'team-a,team-b')
- `--include` Comma-separated patterns to include codeowners (e.g., 'team-_,@org/_')
- `--append` Add commits to existing branches instead of creating new ones
- `--pr` Create pull requests after pushing (requires `--push` and GitHub CLI)
- `--draft-pr` Create draft pull requests after pushing (requires `--push` and GitHub CLI)

> **Note:** You cannot use both `--ignore` and `--include` options at the same time.

Example:

```bash
# Create branches for all codeowners
codeowners-git multi-branch -b "feature/new-feature" -m "Add new feature" -p
# or
cg multi-branch -b "feature/new-feature" -m "Add new feature" -p

# Create branches and automatically create pull requests for each
cg multi-branch -b "feature/new-feature" -m "Add new feature" -p --pr

# Create branches and automatically create draft pull requests for each
cg multi-branch -b "feature/new-feature" -m "Add new feature" -p --draft-pr

# Exclude specific teams
cg multi-branch -b "feature/new-feature" -m "Add new feature" --ignore "@ce-orca,@ce-ece"

# Include only specific patterns
cg multi-branch -b "feature/new-feature" -m "Add new feature" --include "@team-*"

# Use default owner when no codeowners found
cg multi-branch -b "feature/new-feature" -m "Add new feature" -d "@default-team"

# Add more commits to existing branches
cg multi-branch -b "feature/new-feature" -m "Add more changes" --append -p
```

This will:

1. Find all codeowners for the staged files in your repository
2. Apply any ignore/include filters if specified
3. For each codeowner (e.g., @team-a, @team-b):
   - Create a branch like `feature/new-feature/team-a`
   - Commit only the files owned by that team
   - Add a commit message like "Add new feature - @team-a"
   - Push each branch to the remote if the `-p` flag is provided

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
