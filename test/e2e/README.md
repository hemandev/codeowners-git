# E2E Testing for codeowners-git

This directory contains end-to-end tests for the `codeowners-git` CLI tool. The tests use a real git repository with a proper CODEOWNERS file to ensure realistic testing scenarios.

## Test Repository Setup

### Required Test Repository Structure

The test repository at https://github.com/hemandev/cg-test should be structured as follows:

```
cg-test/
├── .github/
│   └── CODEOWNERS              # Main CODEOWNERS file
├── frontend/
│   ├── components/             # @frontend-team @ui-team
│   ├── pages/                  # @frontend-team
│   ├── utils/                  # @frontend-team
│   └── ui/                     # @ui-team
├── backend/
│   ├── api/                    # @backend-team @api-team
│   ├── controllers/            # @backend-team
│   ├── services/               # @backend-team
│   ├── models/                 # @backend-team
│   └── middleware/             # @backend-team
├── shared/
│   ├── types/                  # @shared-team
│   └── utils/                  # @shared-team
├── docs/                       # @docs-team
├── config/                     # @devops-team
└── README.md                   # @docs-team
```

### Recommended CODEOWNERS Configuration

Create `.github/CODEOWNERS` with the following content:

```
# Global owners
* @global-team

# Frontend
/frontend/ @frontend-team
/frontend/components/ @ui-team
/frontend/ui/ @ui-team

# Backend
/backend/ @backend-team
/backend/api/ @api-team

# Shared code
/shared/ @shared-team

# Documentation
/docs/ @docs-team
*.md @docs-team

# Configuration
/config/ @devops-team
*.json @devops-team
*.yml @devops-team
*.yaml @devops-team

# Specific files
package.json @backend-team @frontend-team
tsconfig.json @backend-team @frontend-team
```

## Running E2E Tests

### Prerequisites

1. Build the CLI binary: `bun run build`
2. Ensure the test repository is available (either remote or local)

### Test Commands

```bash
# Run all e2e tests (uses remote repository)
bun run test:e2e

# Run e2e tests with local repository
TEST_REPO_URL=../cg-test bun run test:e2e:local

# Run all tests (unit + e2e)
bun run test:all

# Run with debugging (keeps test directories)
KEEP_TEST_DIR=true bun run test:e2e
```

### Environment Variables

- `TEST_REPO_URL`: Override the test repository URL (default: https://github.com/hemandev/cg-test.git)
- `KEEP_TEST_DIR`: Set to "true" to keep test directories after tests complete (useful for debugging)
- `CI`: Automatically detected in CI environments

## Test Structure

### Test Files

- `setup.ts` - Test setup and teardown utilities
- `helpers.ts` - CLI execution and git operation helpers
- `list.e2e.test.ts` - Tests for the `list` command
- `branch.e2e.test.ts` - Tests for the `branch` command
- `multi-branch.e2e.test.ts` - Tests for the `multi-branch` command
- `integration.e2e.test.ts` - Complex workflow and integration tests

### Test Categories

#### Basic Functionality Tests
- Command execution and output validation
- Option parsing and validation
- Error handling and edge cases

#### File Operation Tests
- Staging and unstaging files
- Mixed file operations (add, modify, delete)
- File filtering by owner patterns

#### Git Integration Tests
- Branch creation and management
- Commit creation and validation
- Repository state consistency

#### Workflow Tests
- Complete user workflows
- Cross-command compatibility
- Performance with large file sets

## Test Data Management

### Test File Creation

Tests create temporary files in the cloned repository during test execution:

```typescript
const changes: GitFileChange[] = [
  {
    path: "frontend/TestComponent.tsx",
    content: "export const TestComponent = () => <div>Test</div>;",
    operation: "add"
  }
];

await helper.stageFiles(changes);
```

### Test Isolation

Each test:
1. Starts with a clean repository state
2. Creates isolated temporary directories
3. Cleans up after execution (unless `KEEP_TEST_DIR=true`)

## Debugging Tests

### Local Debugging

1. Set `KEEP_TEST_DIR=true` to inspect test directories after completion
2. Use a local copy of the test repository with `TEST_REPO_URL=../cg-test`
3. Run individual test files: `bun test test/e2e/list.e2e.test.ts`

### Common Issues

#### Test Repository Access
- Ensure you have access to the test repository
- For local development, clone the test repository to a sibling directory

#### Binary Build Issues
- Ensure `bun run build` completes successfully before running e2e tests
- Check that the binary is created at `bin/codeowners-git`

#### Git Configuration
- Tests require git to be configured with user.name and user.email
- In CI, this is typically handled automatically

### Test Output

Tests provide detailed output including:
- CLI command execution results
- Git operation outcomes
- File staging and commit verification
- Branch creation and management status

## CI/CD Integration

The e2e tests are integrated into the CI pipeline:

```yaml
- name: Run unit tests
  run: bun run test:unit

- name: Build binary for e2e tests
  run: bun run build

- name: Run e2e tests
  run: bun run test:e2e
```

### CI-Specific Considerations

- Tests use the remote test repository in CI
- No special git configuration required (handled by GitHub Actions)
- Tests run in isolated environments for each job

## Extending Tests

### Adding New Test Cases

1. Create test files following the existing naming pattern
2. Use the `E2ETestHelper` class for common operations
3. Follow the setup/teardown pattern for test isolation

### Testing New Features

1. Add tests to the appropriate command test file
2. Include both positive and negative test cases
3. Test edge cases and error conditions
4. Verify git repository state consistency

### Performance Testing

Use the integration tests for performance scenarios:
- Large file sets
- Deep directory structures
- Complex ownership patterns
- Multiple concurrent operations

## Best Practices

1. **Test Isolation**: Each test should be independent and not rely on other test state
2. **Realistic Data**: Use realistic file paths and content that match actual usage patterns
3. **Error Testing**: Include tests for error conditions and edge cases
4. **Performance Awareness**: Be mindful of test execution time, especially with large file sets
5. **Documentation**: Keep this README updated as tests evolve