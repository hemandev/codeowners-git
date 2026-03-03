# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

codeowners-git is a CLI tool for managing large-scale migrations in monorepos with multiple code owners. It creates team-specific branches based on CODEOWNERS file configuration, helping teams review only their relevant changes.

## Development Commands

### Build and Run
- `bun start` - Run the CLI directly from source
- `bun build` - Build standalone binary
- `bun build:dist` - Build for npm distribution

### Testing and Quality
- `bun test` - Run tests in watch mode
- `bun format` - Format code with Biome
- `bun lint` - Lint code with Biome

### Development Workflow
- Use Bun as the primary runtime and package manager
- TypeScript compilation targets ES2023
- Biome handles both formatting and linting

## Architecture

### Core Components
1. **CLI Entry** (`src/cli.ts`) - Commander.js based CLI interface
2. **Commands** (`src/commands/`) - Implementation of list, branch, and multi-branch commands
3. **Utilities** (`src/utils/`)
   - `codeowners.ts` - Parses CODEOWNERS files from standard locations
   - `git.ts` - Git operations using simple-git library
   - `matcher.ts` - Pattern matching for filtering owners
   - `logger.ts` - Consistent logging across the application

### Key Dependencies
- `commander` - CLI framework
- `simple-git` - Git operations
- `codeowners` & `@snyk/github-codeowners` - CODEOWNERS parsing
- `micromatch` - File pattern matching

### Testing Strategy
Tests use Bun's built-in test runner. Current test coverage includes:
- `src/utils/git.test.ts` - Git utility tests
- `src/utils/matcher.test.ts` - Pattern matching tests

To run a single test file: `bun test <filename>`

## Common Tasks

### Adding a New Command
1. Create new file in `src/commands/`
2. Import and register in `src/cli.ts`
3. Follow existing command patterns for options and error handling

### Working with Git Operations
- All git operations go through `src/utils/git.ts`
- Use the existing `git` instance from simple-git
- Maintain consistent error handling patterns

### CODEOWNERS File Locations
The tool checks these locations in order:
1. `.github/CODEOWNERS`
2. `docs/CODEOWNERS`
3. `CODEOWNERS` (root)