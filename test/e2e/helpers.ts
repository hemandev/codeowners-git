import { spawn } from "node:child_process";
import { join } from "node:path";
import { $ } from "bun";
import { unlink } from "node:fs/promises";

export interface CLIResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
}

export interface GitFileChange {
  path: string;
  content: string;
  operation: "add" | "modify" | "delete";
}

export class E2ETestHelper {
  constructor(
    private binPath: string,
    private testRepoPath: string
  ) {}

  /**
   * Execute the CLI with given arguments
   */
  async runCLI(args: string[], options?: { expectFailure?: boolean }): Promise<CLIResult> {
    return new Promise((resolve) => {
      const child = spawn(this.binPath, args, {
        cwd: this.testRepoPath,
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_ENV: "test" },
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (exitCode) => {
        const success = options?.expectFailure ? exitCode !== 0 : exitCode === 0;
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode || 0,
          success,
        });
      });
    });
  }

  /**
   * Run git commands in the test repository
   */
  async runGit(args: string[]): Promise<CLIResult> {
    return new Promise((resolve) => {
      const child = spawn("git", args, {
        cwd: this.testRepoPath,
        stdio: ["pipe", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";

      child.stdout?.on("data", (data) => {
        stdout += data.toString();
      });

      child.stderr?.on("data", (data) => {
        stderr += data.toString();
      });

      child.on("close", (exitCode) => {
        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: exitCode || 0,
          success: exitCode === 0,
        });
      });
    });
  }

  /**
   * Create file changes in the working directory
   * @param changes - Array of file changes to apply
   * @param stage - Whether to stage the changes (default: false)
   *                Set to true when setting up files for commit
   *                Set to false when creating working directory changes for testing
   */
  async stageFiles(changes: GitFileChange[], stage: boolean = false): Promise<void> {
    for (const change of changes) {
      const filePath = join(this.testRepoPath, change.path);

      switch (change.operation) {
        case "add":
        case "modify":
          await Bun.write(filePath, change.content);
          if (stage) {
            await this.runGit(["add", change.path]);
          }
          break;
        case "delete":
          if (stage) {
            await this.runGit(["rm", change.path]);
          } else {
            await unlink(filePath);
          }
          break;
      }
    }
  }

  /**
   * Create a clean working state
   */
  async resetWorkingDirectory(): Promise<void> {
    await this.runGit(["reset", "--hard", "HEAD"]);
    await this.runGit(["clean", "-fd"]);
  }

  /**
   * Get current branch name
   */
  async getCurrentBranch(): Promise<string> {
    const result = await this.runGit(["branch", "--show-current"]);
    return result.stdout;
  }

  /**
   * Switch to a specific branch or create it
   */
  async switchToBranch(branchName: string, create = false): Promise<void> {
    if (create) {
      await this.runGit(["checkout", "-b", branchName]);
    } else {
      await this.runGit(["checkout", branchName]);
    }
  }

  /**
   * Get list of all branches
   */
  async getBranches(): Promise<string[]> {
    const result = await this.runGit(["branch", "--format=%(refname:short)"]);
    return result.stdout.split("\n").filter(branch => branch.trim() !== "");
  }

  /**
   * Check if branch exists
   */
  async branchExists(branchName: string): Promise<boolean> {
    const branches = await this.getBranches();
    return branches.includes(branchName);
  }

  /**
   * Get staged files
   */
  async getStagedFiles(): Promise<string[]> {
    const result = await this.runGit(["diff", "--cached", "--name-only"]);
    return result.stdout ? result.stdout.split("\n") : [];
  }

  /**
   * Get commit history for current branch
   */
  async getCommitHistory(count = 10): Promise<string[]> {
    const result = await this.runGit(["log", `--oneline`, `-n`, count.toString()]);
    return result.stdout ? result.stdout.split("\n") : [];
  }

  /**
   * Delete branch if it exists
   */
  async deleteBranch(branchName: string, force = false): Promise<void> {
    const flag = force ? "-D" : "-d";
    await this.runGit(["branch", flag, branchName]);
  }

  /**
   * Parse CLI table output to structured data
   */
  parseTableOutput(output: string): Array<Record<string, string>> {
    // Remove ANSI color codes
    const cleanOutput = output.replace(/\u001b\[[0-9;]*m/g, '');
    const lines = cleanOutput.split("\n").filter(line => line.trim() !== "");
    if (lines.length < 3) return []; // Need at least header, separator, and one data row

    // Find the header line (usually the first line with │ that doesn't contain ─)
    const headerLine = lines.find(line => line.includes("│") && !line.includes("─"));
    if (!headerLine) return [];

    // Extract column names, removing empty cells
    const headers = headerLine
      .split("│")
      .map(cell => cell.trim())
      .filter(cell => cell !== "");

    // Find data lines (skip header and separator lines)
    const dataLines = lines.filter(line => 
      line.includes("│") &&
      !line.includes("─") && 
      line !== headerLine
    );

    return dataLines.map(line => {
      const cells = line
        .split("│")
        .map(cell => cell.trim())
        .filter(cell => cell !== "");

      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] || "";
      });
      return row;
    });
  }

  /**
   * Wait for a condition to be true (useful for async operations)
   */
  async waitFor(
    condition: () => Promise<boolean> | boolean,
    timeout = 5000,
    interval = 100
  ): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  }
}