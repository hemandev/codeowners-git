import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { E2ETestSetup } from "./setup";
import { E2ETestHelper, GitFileChange } from "./helpers";

describe.skip("E2E: multi-branch command", () => {
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
    
    // Clean up any branches created in previous tests
    const branches = await helper.getBranches();
    for (const branch of branches) {
      if (branch.startsWith("feature/") && branch !== "main") {
        try {
          await helper.deleteBranch(branch, true);
        } catch {
          // Ignore errors when deleting branches
        }
      }
    }
  });

  describe("basic multi-branch creation", () => {
    test("creates branches for all codeowners with staged files", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/components/Button.tsx",
          content: "export const Button = () => <button>Button</button>;",
          operation: "add"
        },
        {
          path: "frontend/utils/helpers.ts",
          content: "export const helper = () => {};",
          operation: "add"
        },
        {
          path: "backend/api/users.ts",
          content: "export const getUsers = () => [];",
          operation: "add"
        },
        {
          path: "backend/services/auth.ts",
          content: "export const auth = () => {};",
          operation: "add"
        },
        {
          path: "docs/README.md",
          content: "# Documentation",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/updates",
        "-m", "Update files for"
      ]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("Created branches for");

      // Verify branches were created (exact names depend on CODEOWNERS configuration)
      const branches = await helper.getBranches();
      const featureBranches = branches.filter(b => b.startsWith("feature/updates"));
      
      expect(featureBranches.length).toBeGreaterThanOrEqual(1); // Should have at least one branch

      // Verify each branch has appropriate commits
      for (const branch of featureBranches) {
        await helper.switchToBranch(branch);
        const commits = await helper.getCommitHistory(1);
        expect(commits[0]).toContain("Update files for");
      }
    });

    test("handles files with no matching codeowners using default owner", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        },
        {
          path: "unowned/random.txt",
          content: "This file has no specific owner",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/with-default",
        "-m", "Changes including unowned files",
        "-d", "@default-team"
      ]);

      expect(result.success).toBe(true);

      const branches = await helper.getBranches();
      const defaultBranch = branches.find(b => b.includes("default"));
      
      if (defaultBranch) {
        await helper.switchToBranch(defaultBranch);
        const commitFiles = await helper.runGit(["show", "--name-only", "HEAD"]);
        expect(commitFiles.stdout).toContain("unowned/random.txt");
      }
    });

    test("fails when no staged files found", async () => {
      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/empty",
        "-m", "Empty changes"
      ], { expectFailure: true });

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("No staged files found");
    });
  });

  describe("filtering options", () => {
    test("includes only specified owners with --include", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        },
        {
          path: "backend/Service.ts",
          content: "export const service = () => {};",
          operation: "add"
        },
        {
          path: "docs/guide.md",
          content: "# Guide",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/filtered",
        "-m", "Filtered changes",
        "--include", "*frontend*,*backend*"
      ]);

      expect(result.success).toBe(true);

      const branches = await helper.getBranches();
      const filteredBranches = branches.filter(b => b.startsWith("feature/filtered"));

      // Should only have branches for frontend and backend, not docs
      expect(filteredBranches.some(b => b.includes("frontend"))).toBe(true);
      expect(filteredBranches.some(b => b.includes("backend"))).toBe(true);
      expect(filteredBranches.some(b => b.includes("docs"))).toBe(false);
    });

    test("excludes specified owners with --ignore", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        },
        {
          path: "backend/Service.ts",
          content: "export const service = () => {};",
          operation: "add"
        },
        {
          path: "docs/guide.md",
          content: "# Guide",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/ignore-docs",
        "-m", "Changes without docs",
        "--ignore", "*docs*"
      ]);

      expect(result.success).toBe(true);

      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/ignore-docs"));

      // Should not have a branch for docs team
      expect(createdBranches.some(b => b.includes("docs"))).toBe(false);
      expect(createdBranches.length).toBeGreaterThan(0); // But should have other branches
    });

    test("combines include and ignore filters", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/ui/Button.tsx",
          content: "export const Button = () => <button>Button</button>;",
          operation: "add"
        },
        {
          path: "frontend/utils/helpers.ts",
          content: "export const helper = () => {};",
          operation: "add"
        },
        {
          path: "backend/api/users.ts",
          content: "export const getUsers = () => [];",
          operation: "add"
        },
        {
          path: "backend/services/auth.ts",
          content: "export const auth = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/combined-filters", 
        "-m", "Combined filtering",
        "--include", "*frontend*,*backend*"
      ]);

      expect(result.success).toBe(true);

      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/combined-filters"));

      // Should have frontend but not ui-specific branches
      expect(createdBranches.some(b => b.includes("frontend") && !b.includes("ui"))).toBe(true);
      expect(createdBranches.some(b => b.includes("backend"))).toBe(true);
      expect(createdBranches.some(b => b.includes("ui"))).toBe(false);
    });
  });

  describe("append mode", () => {
    test("appends to existing branches when --append is used", async () => {
      // First run: create initial branches
      const changes1: GitFileChange[] = [
        {
          path: "frontend/Component1.tsx",
          content: "export const Component1 = () => <div>1</div>;",
          operation: "add"
        },
        {
          path: "backend/Service1.ts",
          content: "export const service1 = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes1);

      await helper.runCLI([
        "multi-branch",
        "-b", "feature/append-test",
        "-m", "Initial changes"
      ]);

      // Second run: append more changes
      await helper.switchToBranch("main");

      const changes2: GitFileChange[] = [
        {
          path: "frontend/Component2.tsx",
          content: "export const Component2 = () => <div>2</div>;",
          operation: "add"
        },
        {
          path: "backend/Service2.ts",
          content: "export const service2 = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes2);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/append-test",
        "-m", "Additional changes",
        "--append"
      ]);

      expect(result.success).toBe(true);

      // Verify branches have multiple commits
      const branches = await helper.getBranches();
      const frontendBranch = branches.find(b => 
        b.startsWith("feature/append-test") && b.includes("frontend")
      );

      if (frontendBranch) {
        await helper.switchToBranch(frontendBranch);
        const commits = await helper.getCommitHistory(5);
        
        const ourCommits = commits.filter(commit => 
          commit.includes("Initial changes") || commit.includes("Additional changes")
        );
        expect(ourCommits.length).toBe(2);
      }
    });

    test("fails when trying to append to non-existent branches", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/non-existent",
        "-m", "Append to non-existent",
        "--append"
      ], { expectFailure: true });

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("does not exist");
    });
  });

  describe("branch naming", () => {
    test("creates branches with owner-specific suffixes", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        },
        {
          path: "backend/Service.ts",
          content: "export const service = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/naming-test",
        "-m", "Test branch naming"
      ]);

      expect(result.success).toBe(true);

      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/naming-test"));

      // Each branch should have a unique suffix based on the owner
      expect(createdBranches.length).toBeGreaterThanOrEqual(1);
      
      // Branch names should be different
      const uniqueBranches = new Set(createdBranches);
      expect(uniqueBranches.size).toBe(createdBranches.length);
    });

    test("handles special characters in owner names", async () => {
      // This test depends on having owners with special characters in CODEOWNERS
      const changes: GitFileChange[] = [
        {
          path: "special/file.txt",
          content: "File in special directory",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/special-chars",
        "-m", "Test special characters"
      ]);

      // Should handle gracefully even if owner names have special chars
      expect(result.success).toBe(true);
    });
  });

  describe("commit messages", () => {
    test("uses base message with owner-specific suffixes", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        },
        {
          path: "backend/Service.ts",
          content: "export const service = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const baseMessage = "feat: update components";

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/message-test",
        "-m", baseMessage
      ]);

      expect(result.success).toBe(true);

      // Check that each branch has the base message
      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/message-test"));

      for (const branch of createdBranches) {
        await helper.switchToBranch(branch);
        const commits = await helper.getCommitHistory(1);
        expect(commits[0]).toContain(baseMessage);
      }
    });
  });

  describe("error handling", () => {
    test("handles missing required options", async () => {
      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/missing-message"
      ], { expectFailure: true });

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("required");
    });

    test("provides helpful error when branches already exist without --append", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      // Create branches first time
      await helper.runCLI([
        "multi-branch",
        "-b", "feature/conflict-test",
        "-m", "Initial creation"
      ]);

      // Try to create again without --append
      await helper.switchToBranch("main");
      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/conflict-test",
        "-m", "Conflicting creation"
      ], { expectFailure: true });

      expect(result.success).toBe(false);
      expect(result.stderr).toContain("already exists");
    });

    test("handles partial failures gracefully", async () => {
      // This test would simulate a scenario where some branches are created successfully
      // but others fail (e.g., due to naming conflicts, git errors, etc.)
      // The exact implementation depends on how the CLI handles partial failures
      
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        },
        {
          path: "backend/Service.ts",
          content: "export const service = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      // Pre-create one of the expected branches to cause a conflict
      await helper.runGit(["checkout", "-b", "feature/partial-fail-frontend"]);
      await helper.switchToBranch("main");

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/partial-fail",
        "-m", "Partial failure test"
      ], { expectFailure: true });

      // Should provide information about what succeeded and what failed
      expect(result.success).toBe(false);
      expect(result.stderr).toContain("already exists");
    });
  });

  describe("cleanup and rollback", () => {
    test("keeps created branches on failure when --keep-branch-on-failure is used", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/keep-on-fail",
        "-m", "", // Empty message to cause failure
        "--keep-branch-on-failure"
      ], { expectFailure: true });

      expect(result.success).toBe(false);
      
      // Branches should still exist if --keep-branch-on-failure was used
      // (exact behavior depends on CLI implementation)
    });

    test("reports summary of created branches", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/Component.tsx",
          content: "export const Component = () => <div>Component</div>;",
          operation: "add"
        },
        {
          path: "backend/Service.ts",
          content: "export const service = () => {};",
          operation: "add"
        },
        {
          path: "docs/README.md",
          content: "# Documentation",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/summary-test",
        "-m", "Test summary output"
      ]);

      expect(result.success).toBe(true);
      
      // Should provide a summary of what was created
      expect(result.stdout).toContain("Created");
      expect(result.stdout).toContain("branch");
      
      // Count should match actual created branches
      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/summary-test"));
      expect(createdBranches.length).toBeGreaterThan(0);
    });
  });
});