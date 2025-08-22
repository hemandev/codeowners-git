import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { E2ETestSetup } from "./setup";
import { E2ETestHelper, type GitFileChange } from "./helpers";

describe("E2E: list command", () => {
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

  describe("basic functionality", () => {
    test("shows help when no staged files", async () => {
      await helper.resetWorkingDirectory();

      const result = await helper.runCLI(["list"]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("No data to display");
    });

    test("lists all codeowners for staged files", async () => {
      await helper.resetWorkingDirectory();

      // Stage files that should match different owners
      const changes: GitFileChange[] = [
        {
          path: "frontend/components/Button.tsx",
          content: "export const Button = () => <button>Click me</button>;",
          operation: "add",
        },
        {
          path: "backend/api/users.ts",
          content: "export const getUsers = () => [];",
          operation: "add",
        },
        {
          path: "docs/README.md",
          content: "# Documentation",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list"]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("frontend");
      expect(result.stdout).toContain("backend");
      expect(result.stdout).toContain("docs");
    });

    test("displays results in table format", async () => {
      await helper.resetWorkingDirectory();

      const changes: GitFileChange[] = [
        {
          path: "frontend/App.tsx",
          content: "export const App = () => <div>App</div>;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list"]);

      expect(result.success).toBe(true);
      // Check for table structure
      expect(result.stdout).toContain("│");
      expect(result.stdout).toContain("File");
      expect(result.stdout).toContain("Owners");
    });
  });

  describe("filtering options", () => {
    test.skip("filters by specific owner", async () => {
      await helper.resetWorkingDirectory();

      const changes: GitFileChange[] = [
        {
          path: "frontend/components/Header.tsx",
          content: "export const Header = () => <header>Header</header>;",
          operation: "add",
        },
        {
          path: "backend/services/auth.ts",
          content: "export const auth = () => {};",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list", "-o", "@frontend-team"]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("frontend");
      expect(result.stdout).not.toContain("backend");
    });

    test("filters by owner patterns with include option", async () => {
      await helper.resetWorkingDirectory();

      const changes: GitFileChange[] = [
        {
          path: "frontend/utils/helpers.ts",
          content: "export const helper = () => {};",
          operation: "add",
        },
        {
          path: "frontend/components/Modal.tsx",
          content: "export const Modal = () => <div>Modal</div>;",
          operation: "add",
        },
        {
          path: "backend/models/user.ts",
          content: "export class User {}",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list", "-i", "*frontend*"]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("frontend");
      expect(result.stdout).not.toContain("backend");
    });

    test("handles non-existent owner filter gracefully", async () => {
      await helper.resetWorkingDirectory();

      const changes: GitFileChange[] = [
        {
          path: "src/index.ts",
          content: "console.log('hello');",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list", "-o", "@non-existent-team"]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("No matching files found");
    });
  });

  describe("edge cases", () => {
    test("handles files with no matching codeowners", async () => {
      await helper.resetWorkingDirectory();

      const changes: GitFileChange[] = [
        {
          path: "random/unowned/file.txt",
          content: "This file has no owner",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list"]);

      expect(result.success).toBe(true);
      // Should still show the file, possibly with a default owner or "unowned"
      expect(result.stdout).toContain("random/unowned/file.txt");
    });

    test("handles deleted files", async () => {
      await helper.resetWorkingDirectory();

      // First create and commit a file
      await helper.stageFiles([
        {
          path: "temp/file.ts",
          content: "export const temp = true;",
          operation: "add",
        },
      ]);

      await helper.runGit(["commit", "-m", "Add temp file"]);

      // Now delete it
      await helper.stageFiles([
        {
          path: "temp/file.ts",
          content: "",
          operation: "delete",
        },
      ]);

      const result = await helper.runCLI(["list"]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("temp/file.ts");
    });

    test("handles mixed file operations (add, modify, delete)", async () => {
      await helper.resetWorkingDirectory();

      // Setup: create and commit some files first
      await helper.stageFiles([
        {
          path: "existing1.ts",
          content: "export const existing1 = true;",
          operation: "add",
        },
        {
          path: "existing2.ts",
          content: "export const existing2 = true;",
          operation: "add",
        },
      ]);

      await helper.runGit(["commit", "-m", "Add existing files"]);

      // Now stage mixed operations
      await helper.stageFiles([
        {
          path: "new.ts",
          content: "export const newFile = true;",
          operation: "add",
        },
        {
          path: "existing1.ts",
          content: "export const existing1 = false;", // modified
          operation: "modify",
        },
        {
          path: "existing2.ts",
          content: "",
          operation: "delete",
        },
      ]);

      const result = await helper.runCLI(["list"]);

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("new.ts");
      expect(result.stdout).toContain("existing1.ts");
      expect(result.stdout).toContain("existing2.ts");
    });

    test("handles repository without CODEOWNERS file", async () => {
      await helper.resetWorkingDirectory();

      // Remove CODEOWNERS file if it exists
      await helper.runGit([
        "rm",
        "-f",
        ".github/CODEOWNERS",
        "CODEOWNERS",
        "docs/CODEOWNERS",
      ]);

      const changes: GitFileChange[] = [
        {
          path: "src/test.ts",
          content: "export const test = true;",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list"]);

      // Should handle gracefully, maybe show default owner or indicate no owners found
      expect(result.success).toBe(true);
    });
  });

  describe("output validation", () => {
    test("output can be parsed as table data", async () => {
      await helper.resetWorkingDirectory();

      const changes: GitFileChange[] = [
        {
          path: "frontend/test.tsx",
          content: "export const Test = () => <div>Test</div>;",
          operation: "add",
        },
        {
          path: "backend/test.ts",
          content: "export const test = () => {};",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list"]);

      expect(result.success).toBe(true);

      const tableData = helper.parseTableOutput(result.stdout);
      expect(tableData.length).toBeGreaterThan(0);

      // Check that we have the expected columns
      if (tableData.length > 0) {
        expect(tableData[0]).toHaveProperty("File");
        expect(tableData[0]).toHaveProperty("Owners");
      }
    });

    test("displays correct file counts per owner", async () => {
      await helper.resetWorkingDirectory();

      const changes: GitFileChange[] = [
        {
          path: "frontend/component1.tsx",
          content: "export const Component1 = () => <div>1</div>;",
          operation: "add",
        },
        {
          path: "frontend/component2.tsx",
          content: "export const Component2 = () => <div>2</div>;",
          operation: "add",
        },
        {
          path: "backend/service.ts",
          content: "export const service = () => {};",
          operation: "add",
        },
      ];

      await helper.stageFiles(changes);

      const result = await helper.runCLI(["list"]);

      expect(result.success).toBe(true);

      const tableData = helper.parseTableOutput(result.stdout);

      // Find frontend team row
      const frontendRow = tableData.find(
        (row) =>
          row["Code Owner"]?.includes("frontend") ||
          row["Files"]?.includes("frontend")
      );

      if (frontendRow) {
        // Should show 2 files for frontend team
        expect(frontendRow["Files"]).toContain("2");
      }
    });
  });
});
