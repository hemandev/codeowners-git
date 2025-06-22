import { describe, expect, test, beforeEach, afterEach, mock } from "bun:test";
import { multiBranch } from "./multi-branch";

describe("multi-branch command", () => {
  let originalExit: typeof process.exit;
  let exitCode: number | undefined;
  let consoleOutput: string[] = [];
  let consoleErrors: string[] = [];
  let consoleWarns: string[] = [];

  beforeEach(() => {
    // Mock process.exit
    originalExit = process.exit;
    exitCode = undefined;
    process.exit = ((code?: number) => {
      exitCode = code;
      throw new Error(`process.exit(${code})`);
    }) as any;

    // Mock console methods
    consoleOutput = [];
    consoleErrors = [];
    consoleWarns = [];

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args: any[]) => {
      consoleOutput.push(args.join(" "));
      originalLog(...args);
    };

    console.error = (...args: any[]) => {
      consoleErrors.push(args.join(" "));
      originalError(...args);
    };

    console.warn = (...args: any[]) => {
      consoleWarns.push(args.join(" "));
      originalWarn(...args);
    };
  });

  afterEach(() => {
    // Restore process.exit
    process.exit = originalExit;
    mock.restore();
  });

  test("should handle missing required options", async () => {
    try {
      await multiBranch({});
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
    }

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((msg) => msg.includes("Missing required options"))
    ).toBe(true);
  });

  test("should handle no changed files", async () => {
    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve([])),
    }));

    try {
      await multiBranch({ branch: "feature", message: "test" });
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
    }

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((msg) => msg.includes("No changed files found"))
    ).toBe(true);
  });

  test("should use default owner when no codeowners found", async () => {
    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve(["file1.js", "file2.js"])),
    }));

    mock.module("../utils/codeowners", () => ({
      getOwner: mock(() => []),
    }));

    let branchCallOptions: any = null;
    mock.module("./branch", () => ({
      branch: mock((options: any) => {
        branchCallOptions = options;
        return Promise.resolve();
      }),
    }));

    // Need to re-import to get the mocked version
    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
      defaultOwner: "@default-team",
    });

    expect(
      consoleOutput.some((msg) => msg.includes("Found 2 files without owners"))
    ).toBe(true);
    expect(
      consoleOutput.some((msg) =>
        msg.includes("Adding default owner: @default-team")
      )
    ).toBe(true);
    expect(branchCallOptions).toBeTruthy();
    expect(branchCallOptions.owner).toBe("@default-team");
    expect(branchCallOptions.branch).toBe("feature/default-team");
  });

  test("should handle multiple codeowners", async () => {
    const branchCalls: any[] = [];

    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve(["file1.js", "file2.js"])),
    }));

    mock.module("../utils/codeowners", () => ({
      getOwner: mock((file: string) => {
        if (file === "file1.js") return ["@team-a", "@team-b"];
        if (file === "file2.js") return ["@team-c"];
        return [];
      }),
    }));

    mock.module("./branch", () => ({
      branch: mock((options: any) => {
        branchCalls.push(options);
        return Promise.resolve();
      }),
    }));

    // Need to re-import to get the mocked version
    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
      push: true,
      remote: "origin",
    });

    expect(branchCalls.length).toBe(3);
    expect(branchCalls[0].owner).toBe("@team-a");
    expect(branchCalls[0].branch).toBe("feature/team-a");
    expect(branchCalls[1].owner).toBe("@team-b");
    expect(branchCalls[1].branch).toBe("feature/team-b");
    expect(branchCalls[2].owner).toBe("@team-c");
    expect(branchCalls[2].branch).toBe("feature/team-c");

    // Check options are passed through
    expect(branchCalls[0].push).toBe(true);
    expect(branchCalls[0].remote).toBe("origin");
  });

  test("should sanitize branch names", async () => {
    const branchCalls: any[] = [];

    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve(["file1.js"])),
    }));

    mock.module("../utils/codeowners", () => ({
      getOwner: mock(() => ["@org/team-name", "user@example.com"]),
    }));

    mock.module("./branch", () => ({
      branch: mock((options: any) => {
        branchCalls.push(options);
        return Promise.resolve();
      }),
    }));

    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
    });

    expect(branchCalls[0].owner).toBe("@org/team-name");
    expect(branchCalls[0].branch).toBe("feature/org-team-name");
    expect(branchCalls[1].owner).toBe("user@example.com");
    expect(branchCalls[1].branch).toBe("feature/user@example-com");
  });

  test("should handle branch creation failures", async () => {
    const successfulOwners: string[] = [];

    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve(["file1.js"])),
    }));

    mock.module("../utils/codeowners", () => ({
      getOwner: mock(() => ["@team-a", "@team-b", "@team-c"]),
    }));

    mock.module("./branch", () => ({
      branch: mock((options: any) => {
        if (options.owner === "@team-b") {
          throw new Error("Branch creation failed");
        }
        successfulOwners.push(options.owner);
        return Promise.resolve();
      }),
    }));

    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
    });

    expect(successfulOwners).toEqual(["@team-a", "@team-c"]);
    expect(
      consoleErrors.some((msg) =>
        msg.includes("Failed to create branch for @team-b")
      )
    ).toBe(true);
    expect(
      consoleOutput.some((msg) => msg.includes("Successful: @team-a, @team-c"))
    ).toBe(true);
    expect(consoleErrors.some((msg) => msg.includes("Failed: @team-b"))).toBe(
      true
    );
  });

  test("should reject when both ignore and include are provided", async () => {
    try {
      await multiBranch({
        branch: "feature",
        message: "test",
        ignore: "team-a",
        include: "team-b",
      });
    } catch (e: any) {
      expect(e.message).toContain("process.exit(1)");
    }

    expect(exitCode).toBe(1);
    expect(
      consoleErrors.some((msg) =>
        msg.includes("Cannot use both --ignore and --include")
      )
    ).toBe(true);
  });

  test("should filter codeowners with ignore patterns", async () => {
    const branchCalls: any[] = [];

    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve(["file1.js", "file2.js"])),
    }));

    mock.module("../utils/codeowners", () => ({
      getOwner: mock((file: string) => {
        if (file === "file1.js") return ["@ce-orca", "@ce-ece", "@team-a"];
        if (file === "file2.js") return ["@ce-backend", "@team-b"];
        return [];
      }),
    }));

    mock.module("./branch", () => ({
      branch: mock((options: any) => {
        branchCalls.push(options);
        return Promise.resolve();
      }),
    }));

    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
      ignore: "@ce-orca,@ce-ece",
    });

    expect(branchCalls.length).toBe(3);
    expect(branchCalls.map((c) => c.owner).sort()).toEqual([
      "@ce-backend",
      "@team-a",
      "@team-b",
    ]);
    expect(
      consoleOutput.some((msg) => msg.includes("Filtered out 2 codeowners"))
    ).toBe(true);
  });

  test("should filter codeowners with include patterns", async () => {
    const branchCalls: any[] = [];

    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve(["file1.js", "file2.js"])),
    }));

    mock.module("../utils/codeowners", () => ({
      getOwner: mock((file: string) => {
        if (file === "file1.js")
          return ["@team-frontend", "@team-backend", "@org/special"];
        if (file === "file2.js") return ["@team-mobile", "@other-team"];
        return [];
      }),
    }));

    mock.module("./branch", () => ({
      branch: mock((options: any) => {
        branchCalls.push(options);
        return Promise.resolve();
      }),
    }));

    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
      include: "@team-*",
    });

    expect(branchCalls.length).toBe(3);
    expect(branchCalls.map((c) => c.owner).sort()).toEqual([
      "@team-backend",
      "@team-frontend",
      "@team-mobile",
    ]);
    expect(
      consoleOutput.some((msg) => msg.includes("Filtered to 3 codeowners"))
    ).toBe(true);
  });

  test("should handle empty result after filtering", async () => {
    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve(["file1.js"])),
    }));

    mock.module("../utils/codeowners", () => ({
      getOwner: mock(() => ["@team-a", "@team-b"]),
    }));

    mock.module("./branch", () => ({
      branch: mock(() => Promise.resolve()),
    }));

    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
      ignore: "@team-*",
    });

    expect(
      consoleWarns.some((msg) =>
        msg.includes("No codeowners left after filtering")
      )
    ).toBe(true);
  });

  test("should handle complex micromatch patterns", async () => {
    const branchCalls: any[] = [];

    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() => Promise.resolve(["file1.js"])),
    }));

    mock.module("../utils/codeowners", () => ({
      getOwner: mock(() => [
        "@org/team-a",
        "@org/team-b",
        "@company/squad-1",
        "@individual",
      ]),
    }));

    mock.module("./branch", () => ({
      branch: mock((options: any) => {
        branchCalls.push(options);
        return Promise.resolve();
      }),
    }));

    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
      include: "@org/*,@company/*",
    });

    expect(branchCalls.length).toBe(3);
    expect(branchCalls.map((c) => c.owner).sort()).toEqual([
      "@company/squad-1",
      "@org/team-a",
      "@org/team-b",
    ]);
  });

  test("should handle owners with no files gracefully", async () => {
    const successfulOwners: string[] = [];

    mock.module("../utils/git", () => ({
      getChangedFiles: mock(() =>
        Promise.resolve(["fileA.js", "fileB.js", "fileC.js"])
      ),
    }));

    // Simulate the exact scenario: fileA,B owned by X and Y, fileC owned by Z
    // But Y doesn't actually have files when branch creation is attempted
    mock.module("../utils/codeowners", () => ({
      getOwner: mock((file: string) => {
        if (file === "fileA.js") return ["@owner-x", "@owner-y"];
        if (file === "fileB.js") return ["@owner-x", "@owner-y"];
        if (file === "fileC.js") return ["@owner-z"];
        return [];
      }),
    }));

    mock.module("./branch", () => ({
      branch: mock((options: any) => {
        // All owners should succeed now, but owner-y will have no files and return early
        successfulOwners.push(options.owner);
        return Promise.resolve();
      }),
    }));

    const { multiBranch: mockedMultiBranch } = await import("./multi-branch");

    await mockedMultiBranch({
      branch: "feature",
      message: "test",
    });

    // Should process all owners successfully now (X, Y, and Z)
    expect(successfulOwners.sort()).toEqual([
      "@owner-x",
      "@owner-y",
      "@owner-z",
    ]);
    expect(
      consoleOutput.some((msg) =>
        msg.includes("Successful: @owner-x, @owner-y, @owner-z")
      )
    ).toBe(true);
  });
});
