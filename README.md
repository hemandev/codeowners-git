# codeowners-git

[![Release](https://github.com/hemandev/codeowners-git/actions/workflows/release.yml/badge.svg)](https://github.com/hemandev/codeowners-git/actions/workflows/release.yml)
[![npm version](https://img.shields.io/npm/v/codeowners-git)](https://www.npmjs.com/package/codeowners-git)
[![license](https://img.shields.io/npm/l/codeowners-git)](LICENSE)

Managing large-scale migrations in big monorepos with multiple codeowners can be overwhelming. Massive PRs touching thousands of files make it hard for teams to review changes efficiently.

`codeowners-git` solves this by:

- Identifying files owned by specific teams using the CODEOWNERS file.
- Creating compact, team-specific branches with only their affected files.
- Streamlining the review process with smaller, targeted PRs.

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
```

## Configuration

The tool automatically detects CODEOWNERS files in:

1. `.github/CODEOWNERS`
2. `docs/CODEOWNERS`
3. `CODEOWNERS` (root directory)

## Commands

### `list`

List current CODEOWNERS entries.

Usage:

```bash
codeowners-git list [options]
```

Options:

- `--owner, -o` Filter by specific owner
- `--include, -i` Include specific patterns

Example:

```bash
codeowners-git list -o @myteam
```

### `branch`

Manage branch permissions in CODEOWNERS file.

Usage:

```bash
codeowners-git branch [options]
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

Example:

```bash
codeowners-git branch -o @myteam -b "feature/new-feature" -m "Add new feature" -p
```

### `multi-branch`

Create branches for all codeowners with changes.

Usage:

```bash
codeowners-git multi-branch [options]
```

Options:

- `--branch, -b` Base branch name (will be prefixed with codeowner name)
- `--message, -m` Base commit message (will be suffixed with codeowner name)
- `--no-verify, -n` Skips lint-staged and other checks before committing
- `--push, -p` Push branches to remote after commit
- `--remote, -r` Remote name to push to (default: "origin")
- `--upstream, -u` Upstream branch name pattern (defaults to local branch name)
- `--force, -f` Force push to remote
- `--keep-branch-on-failure, -k` Keep created branches even if operation fails

Example:

```bash
codeowners-git multi-branch -b "feature/new-feature" -m "Add new feature" -p
```

This will:

1. Find all codeowners for the changed files in your repository
2. For each codeowner (e.g., @team-a, @team-b):
   - Create a branch like `team-a/feature/new-feature`
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
