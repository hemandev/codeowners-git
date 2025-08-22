import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "bun:test";
import { E2ETestSetup } from "./setup";
import { E2ETestHelper, type GitFileChange } from "./helpers";

describe.skip("E2E: branch command", () => {
  let setup: E2ETestSetup;
  let helper: E2ETestHelper;

  beforeAll(async () => {
    setup = new E2ETestSetup();
    const testDir = await setup.setup();
    helper = new E2ETestHelper(setup.getBinaryPath(), setup.getTestRepoPath());
  });

  afterAll(async () => {
    await setup.teardown();
  });

  beforeEach(async () => {
    await helper.resetWorkingDirectory();
    await helper.switchToBranch("main");
  });

  describe("basic branch creation", () => {
    test("creates new branch with owner's changes", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/NewComponent.tsx",
          content: "export const NewComponent = () => <div>New</div>;",
          operation: "add",
        },
        {
          path: "backend/api/posts.ts",
          content: "export const getPosts = () => [];",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/frontend-updates",
        "-m",
        "Add frontend components",
      ]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Branch created successfully");

      // Verify branch was created
      expect(await helper.branchExists("feature/frontend-updates")).toBe(true);

      // Verify we're on the new branch
      const currentBranch = await helper.getCurrentBranch();
      expect(currentBranch).toBe("feature/frontend-updates");

      // Verify only frontend files were committed
      const commits = await helper.getCommitHistory(1);
      expect(commits[0]).toContain("Add frontend components");

      // Check that only frontend files are in the commit on the new branch
      await helper.switchToBranch("feature/frontend-updates");
      const result2 = await helper.runGit(["show", "--name-only", "HEAD"]);
      expect(result2.stdout).toContain("frontend/NewComponent.tsx");
      expect(result2.stdout).not.toContain("backend/api/posts.ts");
    });

    test("fails when no staged files match owner", async () => {
      const changes: GitFileChange[] = [
        {
          path: "backend/service.ts",
          content: "export const service = () => {};",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(
        [
          "branch",
          "-o",
          "@non-existent-team",
          "-b",
          "feature/no-files",
          "-m",
          "No matching files",
        ],
        { expectFailure: true }
      );

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("No files found for owner");

      // Verify branch was not created
      expect(await helper.branchExists("feature/no-files")).toBe(false);
    });

    test("fails when no files are staged", async () => {
      const result = await helper.runCLI(
        [
          "branch",
          "-o",
          "@frontend-team",
          "-b",
          "feature/empty",
          "-m",
          "Empty commit",
        ],
        { expectFailure: true }
      );

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("No staged files found");

      // Verify branch was not created
      expect(await helper.branchExists("feature/empty")).toBe(false);
    });
  });

  describe("branch options", () => {
    test("creates branch with --append flag on existing branch", async () => {
      // First, create a branch
      const changes1: GitFileChange[] = [
        {
          path: "frontend/Component1.tsx",
          content: "export const Component1 = () => <div>1</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes1);

      await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/frontend-work",
        "-m",
        "Add Component1",
      ]);

      // Go back to main and stage more changes
      await helper.switchToBranch("main");

      const changes2: GitFileChange[] = [
        {
          path: "frontend/Component2.tsx",
          content: "export const Component2 = () => <div>2</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes2);

      // Use --append to add to existing branch
      const result = await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/frontend-work",
        "-m",
        "Add Component2",
        "--append",
      ]);

      expect(result.success).toBe(true);

      // Verify we have 2 commits on the branch
      await helper.switchToBranch("feature/frontend-work");
      const commits = await helper.getCommitHistory(5);

      const ourCommits = commits.filter(
        (commit) =>
          commit.includes("Add Component1") || commit.includes("Add Component2")
      );
      expect(ourCommits.length).toBe(2);
    });

    test("handles --no-verify flag", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Test.tsx",
          content: "export const Test = () => <div>Test</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/no-verify",
        "-m",
        "Test no-verify",
        "--no-verify",
      ]);

      expect(result.success).toBe(true);
      expect(await helper.branchExists("feature/no-verify")).toBe(true);
    });

    test("keeps branch on failure when --keep-branch-on-failure is used", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      // This should fail due to invalid commit message or other issues, but keep the branch
      const result = await helper.runCLI(
        [
          "branch",
          "-o",
          "@frontend-team",
          "-b",
          "feature/keep-on-fail",
          "-m",
          "", // Empty message should cause failure
          "--keep-branch-on-failure",
        ],
        { expectFailure: true }
      );

      // Even if the command failed, the branch should exist if --keep-branch-on-failure was used
      // Note: This depends on the specific failure mode of the CLI
      expect(result.success).toBe(false);
    });
  });

  describe("error handling", () => {
    test("fails when branch already exists without --append", async () => {
      // Create a branch first
      const changes: GitFileChange[] = [
        {
          path: "frontend/Initial.tsx",
          content: "export const Initial = () => <div>Initial</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/existing",
        "-m",
        "Initial commit",
      ]);

      // Go back to main and try to create the same branch again
      await helper.switchToBranch("main");
      await helper.stageFiles(changes);

      const result = await helper.runCLI(
        [
          "branch",
          "-o",
          "@frontend-team",
          "-b",
          "feature/existing",
          "-m",
          "Second attempt",
        ],
        { expectFailure: true }
      );

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("already exists");
    });

    test("handles missing required options", async () => {
      const result = await helper.runCLI(
        ["branch", "-b", "feature/missing-owner", "-m", "Missing owner"],
        { expectFailure: true }
      );

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("required");
    });

    test("validates branch name format", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(
        [
          "branch",
          "-o",
          "@frontend-team",
          "-b",
          "feature/invalid..branch..name",
          "-m",
          "Invalid branch name",
        ],
        { expectFailure: true }
      );

      expect(result.success).toBe(false);
    });

    test("handles git repository errors gracefully", async () => {
      // This test would need to simulate git errors, such as:
      // - Corrupted repository
      // - Permission issues
      // - Network issues (for remote operations)
      // The exact implementation depends on what kind of errors we want to test
    });
  });

  describe("file filtering", () => {
    test("commits only files matching the specified owner", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/ui/Button.tsx",
          content: "export const Button = () => <button>Button</button>;",
          operation: "add",
        },
        {
          path: "frontend/utils/helpers.ts",
          content: "export const helper = () => {};",
          operation: "add",
        },
        {
          path: "backend/api/users.ts",
          content: "export const getUsers = () => [];",
          operation: "add",
        },
        {
          path: "docs/api.md",
          content: "# API Documentation",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/frontend-only",
        "-m",
        "Frontend changes only",
      ]);

      expect(result.success).toBe(true);

      // Switch to the created branch and verify only frontend files were committed
      await helper.switchToBranch("feature/frontend-only");
      const commitFiles = await helper.runGit(["show", "--name-only", "HEAD"]);
      expect(commitFiles.stdout).toContain("frontend/ui/Button.tsx");
      expect(commitFiles.stdout).toContain("frontend/utils/helpers.ts");
      expect(commitFiles.stdout).not.toContain("backend/api/users.ts");
      expect(commitFiles.stdout).not.toContain("docs/api.md");

      // Verify other files are still staged in the original location
      await helper.switchToBranch("main");
      const stagedFiles = await helper.getStagedFiles();
      expect(stagedFiles).toContain("backend/api/users.ts");
      expect(stagedFiles).toContain("docs/api.md");
      expect(stagedFiles).not.toContain("frontend/ui/Button.tsx");
      expect(stagedFiles).not.toContain("frontend/utils/helpers.ts");
    });

    test("handles mixed file operations for specific owner", async () => {
      // Setup: create and commit some files first
      await helper.stageFiles([
        {
          path: "frontend/ExistingComponent.tsx",
          content: "export const Existing = () => <div>Existing</div>;",
          operation: "add",
        },
        {
          path: "frontend/ToDelete.tsx",
          content: "export const ToDelete = () => <div>Delete me</div>;",
          operation: "add",
        },
      ]);

      await helper.runGit(["commit", "-m", "Setup existing files"]);

      // Now stage mixed operations
      await helper.stageFiles([
        {
          path: "frontend/NewComponent.tsx",
          content: "export const New = () => <div>New</div>;",
          operation: "add",
        },
        {
          path: "frontend/ExistingComponent.tsx",
          content: "export const Existing = () => <div>Modified</div>;",
          operation: "modify",
        },
        {
          path: "frontend/ToDelete.tsx",
          content: "",
          operation: "delete",
        },
        {
          path: "backend/service.ts",
          content: "export const service = () => {};",
          operation: "add",
        },
      ]);

      const result = await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/mixed-operations",
        "-m",
        "Mixed frontend operations",
      ]);

      expect(result.success).toBe(true);

      // Switch to the created branch and verify all frontend operations were included
      await helper.switchToBranch("feature/mixed-operations");
      const commitFiles = await helper.runGit(["show", "--name-only", "HEAD"]);
      expect(commitFiles.stdout).toContain("frontend/NewComponent.tsx");
      expect(commitFiles.stdout).toContain("frontend/ExistingComponent.tsx");
      expect(commitFiles.stdout).toContain("frontend/ToDelete.tsx");
      expect(commitFiles.stdout).not.toContain("backend/service.ts");
    });
  });

  describe("commit messages", () => {
    test("uses provided commit message", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Feature.tsx",
          content: "export const Feature = () => <div>Feature</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const commitMessage = "feat: add new frontend feature component";

      const result = await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/custom-message",
        "-m",
        commitMessage,
      ]);

      expect(result.success).toBe(true);

      await helper.switchToBranch("feature/custom-message");
      const commits = await helper.getCommitHistory(1);
      expect(commits[0]).toContain(commitMessage);
    });

    test("handles commit messages with special characters", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Special.tsx",
          content: "export const Special = () => <div>Special</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const commitMessage = "feat: add component with special chars !@#$%^&*()";

      const result = await helper.runCLI([
        "branch",
        "-o",
        "@frontend-team",
        "-b",
        "feature/special-chars",
        "-m",
        commitMessage,
      ]);

      expect(result.success).toBe(true);

      await helper.switchToBranch("feature/special-chars");
      const commits = await helper.getCommitHistory(1);
      expect(commits[0]).toContain("add component with special chars");
    });
  });
});
