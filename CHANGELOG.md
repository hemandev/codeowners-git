# codeowners-git

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
