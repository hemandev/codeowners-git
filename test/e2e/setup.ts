import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { $ } from "bun";

export interface E2ETestConfig {
  testRepoUrl: string;
  binPath: string;
  keepTestDir: boolean;
  isCI: boolean;
}

export class E2ETestSetup {
  private testDir: string | null = null;
  private config: E2ETestConfig;

  constructor(config?: Partial<E2ETestConfig>) {
    this.config = {
      testRepoUrl: process.env.TEST_REPO_URL || "https://github.com/hemandev/cg-test.git",
      binPath: join(process.cwd(), "bin", "codeowners-git"),
      keepTestDir: process.env.KEEP_TEST_DIR === "true",
      isCI: process.env.CI === "true",
      ...config,
    };
  }

  async setup(): Promise<string> {
    // Build the binary first
    await this.buildBinary();

    // Create temporary directory
    this.testDir = await mkdtemp(join(tmpdir(), "cg-e2e-"));

    // Clone the test repository
    await this.cloneTestRepo();

    return this.testDir;
  }

  async teardown(): Promise<void> {
    if (this.testDir && !this.config.keepTestDir) {
      try {
        await rm(this.testDir, { recursive: true, force: true });
      } catch (error) {
        console.warn(`Failed to cleanup test directory: ${error}`);
      }
    }
  }

  private async buildBinary(): Promise<void> {
    console.log("Building binary for e2e tests...");
    try {
      await $`bun build src/cli.ts --compile --outfile ${this.config.binPath}`;
      console.log(`Binary built at: ${this.config.binPath}`);
    } catch (error) {
      throw new Error(`Failed to build binary: ${error}`);
    }
  }

  private async cloneTestRepo(): Promise<void> {
    if (!this.testDir) {
      throw new Error("Test directory not initialized");
    }

    console.log(`Cloning test repository: ${this.config.testRepoUrl}`);
    try {
      await $`git clone ${this.config.testRepoUrl} ${this.testDir}/test-repo`.cwd(this.testDir);
      console.log(`Test repository cloned to: ${this.testDir}/test-repo`);
    } catch (error) {
      throw new Error(`Failed to clone test repository: ${error}`);
    }
  }

  getTestRepoPath(): string {
    if (!this.testDir) {
      throw new Error("Test directory not initialized");
    }
    return join(this.testDir, "test-repo");
  }

  getBinaryPath(): string {
    return this.config.binPath;
  }

  getConfig(): E2ETestConfig {
    return this.config;
  }
}