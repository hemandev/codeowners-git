# codeowners-git

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
