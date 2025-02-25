import { getChangedFiles } from "../utils/git";
import { getOwner } from "../utils/codeowners";
import { branch } from "./branch";
import { log } from "../utils/logger";

export type MultiBranchOptions = {
  branch?: string;
  message?: string;
  verify?: boolean;
  push?: boolean;
  remote?: string;
  upstream?: string;
  force?: boolean;
  keepBranchOnFailure?: boolean;
};

export const multiBranch = async (options: MultiBranchOptions) => {
  try {
    if (!options.branch || !options.message) {
      throw new Error("Missing required options for multi-branch creation");
    }

    log.info("Starting multi-branch creation process...");

    // Get all changed files
    const changedFiles = await getChangedFiles();

    if (changedFiles.length === 0) {
      throw new Error("No changed files found in the repository");
    }

    // Extract all codeowners from the changed files
    const ownerSet = new Set<string>();
    for (const file of changedFiles) {
      const owners = getOwner(file);
      for (const owner of owners) {
        ownerSet.add(owner);
      }
    }

    const codeowners = Array.from(ownerSet);

    if (codeowners.length === 0) {
      throw new Error("No codeowners found for the changed files");
    }

    log.info(`Found ${codeowners.length} codeowners: ${codeowners.join(", ")}`);

    // Track success and failures
    const results = {
      success: [] as string[],
      failure: [] as string[],
    };

    // Process each codeowner
    for (const owner of codeowners) {
      try {
        // Sanitize owner name for branch
        const sanitizedOwner = owner
          .replace(/[^a-zA-Z0-9-_@]/g, "-")
          .replace(/^@/, "");

        // Format branch name: [branch-option]/owner
        const branchName = `${options.branch}/${sanitizedOwner}`;

        // Format commit message with owner
        const commitMessage = `${options.message} - ${owner}`;

        log.info(`Creating branch for ${owner}...`);

        // Create branch for this owner
        await branch({
          owner: owner,
          branch: branchName,
          message: commitMessage,
          verify: options.verify,
          push: options.push,
          remote: options.remote,
          upstream: options.upstream,
          force: options.force,
          keepBranchOnFailure: options.keepBranchOnFailure,
        });

        results.success.push(owner);
      } catch (error) {
        log.error(`Failed to create branch for ${owner}: ${error}`);
        results.failure.push(owner);
      }
    }

    log.header("Multi-branch creation summary");
    log.info(
      `Successfully created branches for ${results.success.length} of ${codeowners.length} codeowners`
    );

    if (results.success.length) {
      log.success(`Successful: ${results.success.join(", ")}`);
    }

    if (results.failure.length) {
      log.error(`Failed: ${results.failure.join(", ")}`);
    }
  } catch (err) {
    log.error(`Multi-branch operation failed: ${err}`);
    process.exit(1);
  }
};
