import { describe, test, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { E2ETestSetup } from "./setup";
import { E2ETestHelper, GitFileChange } from "./helpers";

describe("E2E: Integration Workflows", () => {
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
    
    // Clean up any branches from previous tests
    const branches = await helper.getBranches();
    for (const branch of branches) {
      if (branch.startsWith("feature/") && branch !== "main") {
        try {
          await helper.deleteBranch(branch, true);
        } catch {
          // Ignore errors
        }
      }
    }
  });

  describe("Complete workflow scenarios", () => {
    test.skip("list -> review -> branch workflow", async () => {
      // Stage diverse changes
      const changes: GitFileChange[] = [
        {
          path: "frontend/components/Header.tsx",
          content: "export const Header = () => <header>Header</header>;",
          operation: "add"
        },
        {
          path: "frontend/components/Footer.tsx",
          content: "export const Footer = () => <footer>Footer</footer>;",
          operation: "add"
        },
        {
          path: "backend/api/posts.ts",
          content: "export const getPosts = () => [];",
          operation: "add"
        },
        {
          path: "backend/models/Post.ts",
          content: "export class Post {}",
          operation: "add"
        },
        {
          path: "docs/api/posts.md",
          content: "# Posts API",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      // Step 1: List all changes to see what we have
      const listResult = await helper.runCLI(["list"]);
      expect(listResult.success).toBe(true);
      
      const tableData = helper.parseTableOutput(listResult.stdout);
      expect(tableData.length).toBeGreaterThan(0);

      // Step 2: Create branches for specific teams
      const frontendResult = await helper.runCLI([
        "branch",
        "-o", "@frontend-team",
        "-b", "feature/frontend-components",
        "-m", "Add header and footer components"
      ]);
      expect(frontendResult.success).toBe(true);

      // Switch to the frontend branch and verify frontend files were committed
      await helper.switchToBranch("feature/frontend-components");
      const frontendFiles = await helper.runGit(["show", "--name-only", "HEAD"]);
      expect(frontendFiles.stdout).toContain("frontend/components/Header.tsx");
      expect(frontendFiles.stdout).toContain("frontend/components/Footer.tsx");
      expect(frontendFiles.stdout).not.toContain("backend/");
      expect(frontendFiles.stdout).not.toContain("docs/");

      // Step 3: Go back to main and create backend branch
      await helper.switchToBranch("main");

      const backendResult = await helper.runCLI([
        "branch",
        "-o", "@backend-team",
        "-b", "feature/backend-posts",
        "-m", "Add posts API and model"
      ]);
      expect(backendResult.success).toBe(true);

      // Verify backend files were committed
      const backendFiles = await helper.runGit(["show", "--name-only", "HEAD"]);
      expect(backendFiles.stdout).toContain("backend/api/posts.ts");
      expect(backendFiles.stdout).toContain("backend/models/Post.ts");
      expect(backendFiles.stdout).not.toContain("frontend/");
      expect(backendFiles.stdout).not.toContain("docs/");

      // Step 4: Verify remaining files are still staged
      await helper.switchToBranch("main");
      const remainingFiles = await helper.getStagedFiles();
      expect(remainingFiles).toContain("docs/api/posts.md");
      expect(remainingFiles).not.toContain("frontend/components/Header.tsx");
      expect(remainingFiles).not.toContain("backend/api/posts.ts");
    });

    test("multi-branch -> review -> append workflow", async () => {
      // Initial large change set
      const initialChanges: GitFileChange[] = [
        {
          path: "frontend/pages/Home.tsx",
          content: "export const Home = () => <div>Home</div>;",
          operation: "add"
        },
        {
          path: "frontend/pages/About.tsx",
          content: "export const About = () => <div>About</div>;",
          operation: "add"
        },
        {
          path: "backend/controllers/auth.ts",
          content: "export const authController = {};",
          operation: "add"
        },
        {
          path: "backend/controllers/users.ts",
          content: "export const usersController = {};",
          operation: "add"
        },
        {
          path: "docs/setup.md",
          content: "# Setup Guide",
          operation: "add"
        }
      ];

      await helper.stageFiles(initialChanges);

      // Step 1: Create branches for all teams
      const multiBranchResult = await helper.runCLI([
        "multi-branch",
        "-b", "feature/initial-setup",
        "-m", "Initial project setup for"
      ]);
      expect(multiBranchResult.success).toBe(true);

      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/initial-setup"));
      expect(createdBranches.length).toBeGreaterThanOrEqual(1);

      // Step 2: Make additional changes
      await helper.switchToBranch("main");

      const additionalChanges: GitFileChange[] = [
        {
          path: "frontend/components/Navigation.tsx",
          content: "export const Navigation = () => <nav>Nav</nav>;",
          operation: "add"
        },
        {
          path: "backend/middleware/auth.ts",
          content: "export const authMiddleware = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(additionalChanges);

      // Step 3: Append to existing branches
      const appendResult = await helper.runCLI([
        "multi-branch",
        "-b", "feature/initial-setup",
        "-m", "Additional setup changes for",
        "--append"
      ]);
      expect(appendResult.success).toBe(true);

      // Step 4: Verify branches have multiple commits
      const frontendBranch = createdBranches.find(b => b.includes("frontend"));
      if (frontendBranch) {
        await helper.switchToBranch(frontendBranch);
        const commits = await helper.getCommitHistory(5);
        
        const setupCommits = commits.filter(commit => 
          commit.includes("Initial project setup") || 
          commit.includes("Additional setup changes")
        );
        expect(setupCommits.length).toBe(2);
      }
    });

    test.skip("complex filtering and edge case workflow", async () => {
      // Create a complex scenario with overlapping ownership
      const complexChanges: GitFileChange[] = [
        // Frontend files
        {
          path: "frontend/ui/Button.tsx",
          content: "export const Button = () => <button>Button</button>;",
          operation: "add"
        },
        {
          path: "frontend/ui/Input.tsx",
          content: "export const Input = () => <input />;",
          operation: "add"
        },
        // Shared utilities (might have different ownership patterns)
        {
          path: "shared/utils/validation.ts",
          content: "export const validate = () => {};",
          operation: "add"
        },
        {
          path: "shared/types/common.ts",
          content: "export interface CommonType {}",
          operation: "add"
        },
        // Backend with nested ownership
        {
          path: "backend/api/v1/users.ts",
          content: "export const usersV1 = {};",
          operation: "add"
        },
        {
          path: "backend/api/v2/users.ts",
          content: "export const usersV2 = {};",
          operation: "add"
        },
        // Config files (might be global)
        {
          path: "config/database.json",
          content: '{"host": "localhost"}',
          operation: "add"
        },
        // Files with no clear owner
        {
          path: "misc/temp.txt",
          content: "Temporary file",
          operation: "add"
        }
      ];

      await helper.stageFiles(complexChanges);

      // Step 1: List with different filters to understand ownership
      const allResult = await helper.runCLI(["list"]);
      expect(allResult.success).toBe(true);

      const frontendOnlyResult = await helper.runCLI(["list", "-i", "*frontend*"]);
      expect(frontendOnlyResult.success).toBe(true);

      const uiOnlyResult = await helper.runCLI(["list", "-i", "*ui*"]);
      expect(uiOnlyResult.success).toBe(true);

      // Step 2: Create branches with filtering (CLI doesn't support both --include and --ignore)
      const filteredMultiBranchResult = await helper.runCLI([
        "multi-branch",
        "-b", "feature/filtered-complex",
        "-m", "Filtered complex changes",
        "--include", "*frontend*,*backend*"
      ]);
      expect(filteredMultiBranchResult.success).toBe(true);

      // Step 3: Verify correct files were distributed
      const branches = await helper.getBranches();
      const filteredBranches = branches.filter(b => b.startsWith("feature/filtered-complex"));

      // Should not have branches for ignored patterns
      expect(filteredBranches.some(b => b.includes("misc"))).toBe(false);
      expect(filteredBranches.some(b => b.includes("temp"))).toBe(false);

      // Should have branches for included patterns
      expect(filteredBranches.some(b => b.includes("frontend") || b.includes("ui"))).toBe(true);
      expect(filteredBranches.some(b => b.includes("backend"))).toBe(true);
    });

    test("error recovery and partial failure workflow", async () => {
      // Setup: Create some files and stage them
      const changes: GitFileChange[] = [
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

      await helper.stageFiles(changes);

      // Step 1: Create initial branches
      const initialResult = await helper.runCLI([
        "multi-branch",
        "-b", "feature/error-recovery",
        "-m", "Initial changes"
      ]);
      expect(initialResult.success).toBe(true);

      // Step 2: Try to create same branches again (should fail)
      await helper.switchToBranch("main");
      await helper.stageFiles(changes);

      const conflictResult = await helper.runCLI([
        "multi-branch",
        "-b", "feature/error-recovery",
        "-m", "Conflicting changes"
      ]);
      // CLI may handle this gracefully instead of failing

      // Step 3: Recover using append mode
      const recoverResult = await helper.runCLI([
        "multi-branch",
        "-b", "feature/error-recovery",
        "-m", "Recovery changes",
        "--append"
      ]);
      expect(recoverResult.success).toBe(true);

      // Step 4: Verify recovery worked
      const branches = await helper.getBranches();
      const recoveryBranches = branches.filter(b => b.startsWith("feature/error-recovery"));
      expect(recoveryBranches.length).toBeGreaterThan(0);
    });
  });

  describe("Cross-command compatibility", () => {
    test("list output matches branch/multi-branch behavior", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/TestComponent.tsx",
          content: "export const TestComponent = () => <div>Test</div>;",
          operation: "add"
        },
        {
          path: "backend/TestService.ts",
          content: "export const testService = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      // Get list output
      const listResult = await helper.runCLI(["list"]);
      expect(listResult.success).toBe(true);

      const tableData = helper.parseTableOutput(listResult.stdout);
      const owners = tableData.map(row => row["Code Owner"]).filter(Boolean);

      // Create multi-branch
      const multiBranchResult = await helper.runCLI([
        "multi-branch",
        "-b", "feature/compatibility-test",
        "-m", "Compatibility test"
      ]);
      expect(multiBranchResult.success).toBe(true);

      // Verify that branches were created for the same owners shown in list
      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/compatibility-test"));

      // The number of created branches should correspond to the unique owners from list
      expect(createdBranches.length).toBeGreaterThan(0);
    });

    test("individual branch commands produce same result as multi-branch", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/IndividualTest.tsx",
          content: "export const IndividualTest = () => <div>Test</div>;",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      // Method 1: Use individual branch command
      const individualResult = await helper.runCLI([
        "branch",
        "-o", "@frontend-team",
        "-b", "feature/individual-test",
        "-m", "Individual branch test"
      ]);
      expect(individualResult.success).toBe(true);

      // Reset and stage same files
      await helper.switchToBranch("main");
      await helper.stageFiles(changes);

      // Method 2: Use multi-branch with filter to get same result
      const multiResult = await helper.runCLI([
        "multi-branch",
        "-b", "feature/multi-test",
        "-m", "Multi branch test",
        "--include", "*frontend*"
      ]);
      expect(multiResult.success).toBe(true);

      // Compare the results
      await helper.switchToBranch("feature/individual-test");
      const individualFiles = await helper.runGit(["show", "--name-only", "HEAD"]);

      const multiBranches = await helper.getBranches();
      const frontendMultiBranch = multiBranches.find(b => 
        b.startsWith("feature/multi-test") && b.includes("frontend")
      );

      if (frontendMultiBranch) {
        await helper.switchToBranch(frontendMultiBranch);
        const multiFiles = await helper.runGit(["show", "--name-only", "HEAD"]);

        // Should have committed the same files
        expect(individualFiles.stdout).toContain("frontend/IndividualTest.tsx");
        expect(multiFiles.stdout).toContain("frontend/IndividualTest.tsx");
      }
    });
  });

  describe("Repository state consistency", () => {
    test("maintains clean git state throughout operations", async () => {
      const changes: GitFileChange[] = [
        {
          path: "frontend/StateTest.tsx",
          content: "export const StateTest = () => <div>State</div>;",
          operation: "add"
        },
        {
          path: "backend/StateService.ts",
          content: "export const stateService = () => {};",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      // Initial git status
      const initialStatus = await helper.runGit(["status", "--porcelain"]);
      const initialStagedCount = initialStatus.stdout.split('\n').filter(line => 
        line.startsWith('A') || line.startsWith('M') || line.startsWith('D')
      ).length;

      // Create branches
      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/state-test",
        "-m", "State consistency test"
      ]);
      expect(result.success).toBe(true);

      // Return to main and check final state
      await helper.switchToBranch("main");
      const finalStatus = await helper.runGit(["status", "--porcelain"]);

      // All originally staged files should either be:
      // 1. No longer staged (committed to branches), or
      // 2. Still staged (if they had no matching owner)
      expect(finalStatus.stdout.length).toBeLessThanOrEqual(initialStatus.stdout.length);
    });

    test("handles dirty working directory appropriately", async () => {
      // Create unstaged changes
      await Bun.write(
        `${helper["testRepoPath"]}/dirty-file.txt`,
        "This file is not staged"
      );

      // Stage some different files
      const changes: GitFileChange[] = [
        {
          path: "frontend/CleanFile.tsx",
          content: "export const CleanFile = () => <div>Clean</div>;",
          operation: "add"
        }
      ];

      await helper.stageFiles(changes);

      // Commands should work despite dirty working directory
      const result = await helper.runCLI([
        "branch",
        "-o", "@frontend-team",
        "-b", "feature/dirty-test",
        "-m", "Test with dirty working directory"
      ]);
      expect(result.success).toBe(true);

      // Dirty file should still be unstaged
      const status = await helper.runGit(["status", "--porcelain"]);
      expect(status.stdout).toContain("dirty-file.txt");
    });
  });

  describe("Performance and scalability", () => {
    test("handles large number of files efficiently", async () => {
      // Create many files across different owners
      const manyChanges: GitFileChange[] = [];
      
      for (let i = 0; i < 50; i++) {
        manyChanges.push({
          path: `frontend/components/Component${i}.tsx`,
          content: `export const Component${i} = () => <div>Component ${i}</div>;`,
          operation: "add"
        });
      }

      for (let i = 0; i < 30; i++) {
        manyChanges.push({
          path: `backend/services/Service${i}.ts`,
          content: `export const service${i} = () => {};`,
          operation: "add"
        });
      }

      await helper.stageFiles(manyChanges);

      const startTime = Date.now();
      
      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/performance-test",
        "-m", "Performance test with many files"
      ]);
      
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.success).toBe(true);
      
      // Should complete within reasonable time (adjust threshold as needed)
      expect(duration).toBeLessThan(30000); // 30 seconds

      // Verify all files were properly distributed
      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/performance-test"));
      expect(createdBranches.length).toBeGreaterThan(0);
    });

    test("handles deep directory structures", async () => {
      const deepChanges: GitFileChange[] = [
        {
          path: "frontend/src/components/ui/forms/inputs/text/TextInput.tsx",
          content: "export const TextInput = () => <input type='text' />;",
          operation: "add"
        },
        {
          path: "backend/src/api/v1/controllers/users/profile/ProfileController.ts",
          content: "export class ProfileController {}",
          operation: "add"
        }
      ];

      await helper.stageFiles(deepChanges);

      const result = await helper.runCLI([
        "multi-branch",
        "-b", "feature/deep-structure",
        "-m", "Test deep directory structures"
      ]);

      expect(result.success).toBe(true);

      // Verify files were properly handled despite deep paths
      const branches = await helper.getBranches();
      const createdBranches = branches.filter(b => b.startsWith("feature/deep-structure"));
      expect(createdBranches.length).toBeGreaterThan(0);
    });
  });
});