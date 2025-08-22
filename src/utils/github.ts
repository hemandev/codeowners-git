import { spawn } from "child_process";
import { readFile } from "fs/promises";
import { log } from "./logger";

export type CreatePROptions = {
  title: string;
  body?: string;
  draft?: boolean;
  base?: string;
  head?: string;
};

export type PRTemplate = {
  path: string;
  content: string;
};

/**
 * Check if GitHub CLI is installed and available
 */
export const isGitHubCliInstalled = async (): Promise<boolean> => {
  return new Promise((resolve) => {
    const process = spawn("gh", ["--version"], { stdio: "pipe" });

    process.on("close", (code) => {
      resolve(code === 0);
    });

    process.on("error", () => {
      resolve(false);
    });
  });
};

/**
 * Find PR template in standard GitHub locations
 */
export const findPRTemplate = async (): Promise<PRTemplate | null> => {
  const possiblePaths = [
    ".github/pull_request_template.md",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/PULL_REQUEST_TEMPLATE/pull_request_template.md",
    "docs/pull_request_template.md",
    "docs/PULL_REQUEST_TEMPLATE.md",
    "pull_request_template.md",
    "PULL_REQUEST_TEMPLATE.md",
  ];

  for (const templatePath of possiblePaths) {
    try {
      const content = await readFile(templatePath, "utf-8");
      log.info(`Found PR template at: ${templatePath}`);
      return { path: templatePath, content: content.trim() };
    } catch {
      // File doesn't exist, continue to next path
    }
  }

  return null;
};

/**
 * Create a pull request using GitHub CLI
 */
export const createPullRequest = async (
  options: CreatePROptions
): Promise<{ url: string; number: number } | null> => {
  const { title, body, draft = false, base = "main", head } = options;

  if (!(await isGitHubCliInstalled())) {
    throw new Error(
      "GitHub CLI (gh) is not installed. Please install it to create pull requests."
    );
  }

  // Build gh command arguments
  const args = ["pr", "create", "--title", title];

  if (body) {
    args.push("--body", body);
  }

  if (draft) {
    args.push("--draft");
  }

  if (base) {
    args.push("--base", base);
  }

  if (head) {
    args.push("--head", head);
  }

  return new Promise((resolve, reject) => {
    const process = spawn("gh", args, { stdio: "pipe" });

    let output = "";
    let errorOutput = "";

    process.stdout.on("data", (data) => {
      output += data.toString();
    });

    process.stderr.on("data", (data) => {
      errorOutput += data.toString();
    });

    process.on("close", (code) => {
      if (code === 0) {
        // Extract PR URL from output
        const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
        const numberMatch = output.match(/#(\d+)/);

        if (urlMatch && numberMatch) {
          const url = urlMatch[0];
          const number = parseInt(numberMatch[1], 10);
          log.success(`${draft ? "Draft " : ""}Pull request created: ${url}`);
          resolve({ url, number });
        } else {
          log.success(
            `${draft ? "Draft " : ""}Pull request created successfully`
          );
          resolve({ url: output.trim(), number: 0 });
        }
      } else {
        const error = new Error(
          `Failed to create pull request: ${errorOutput || output}`
        );
        log.error(error.message);
        reject(error);
      }
    });

    process.on("error", (error) => {
      reject(new Error(`Failed to execute gh command: ${error.message}`));
    });
  });
};

/**
 * Create PR with template if available
 */
export const createPRWithTemplate = async (
  title: string,
  branchName: string,
  options: { draft?: boolean; base?: string } = {}
): Promise<{ url: string; number: number } | null> => {
  const template = await findPRTemplate();
  let body = "";

  if (template) {
    body = template.content;
    log.info("Using PR template for pull request body");
  }

  return createPullRequest({
    title,
    body,
    draft: options.draft,
    base: options.base,
    head: branchName,
  });
};
