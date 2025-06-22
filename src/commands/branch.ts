import {
  getCurrentBranch,
  createBranch,
  commitChanges,
  checkout,
  pushBranch,
  deleteBranch,
  branchExists,
} from "../utils/git";
import { log } from "../utils/logger";
import { getOwnerFiles } from "../utils/codeowners";

export type BranchOptions = {
  owner?: string;
  branch?: string;
  message?: string;
  verify?: boolean;
  push?: boolean;
  remote?: string;
  upstream?: string;
  force?: boolean;
  keepBranchOnFailure?: boolean;
  isDefaultOwner?: boolean;
};

export const branch = async (options: BranchOptions) => {
  // Variables for cleanup
  let originalBranch = "";
  let stashId: string | null = null;
  let newBranchCreated = false;
  let filesToCommit: string[] = [];

  try {
    if (!options.branch || !options.message || !options.owner) {
      throw new Error("Missing required options for branch creation");
    }

    log.info("Starting branch creation process...");

    // Save current state
    originalBranch = await getCurrentBranch();
    log.info(`Currently on branch: ${originalBranch}`);

    // First, identify the files owned by the specified owner
    filesToCommit = await getOwnerFiles(options.owner, options.isDefaultOwner || false);
    if (filesToCommit.length <= 0) {
      log.warn(`No files found for ${options.owner}. Skipping branch creation.`);
      return;
    }

    log.file(`Files to be committed:\n  ${filesToCommit.join("\n  ")}`);

    // Check if branch already exists
    if (await branchExists(options.branch)) {
      throw new Error(
        `Branch "${options.branch}" already exists. Use a different name or delete the existing branch first.`
      );
    }

    try {
      // Create and switch to new branch
      log.info(`Creating new branch "${options.branch}"...`);
      await createBranch(options.branch);
      newBranchCreated = true;

      // Commit changes
      log.info(
        `Committing changes with message: "${options.message}" ${
          !options.verify ? "(no-verify)" : ""
        }...`
      );
      await commitChanges(filesToCommit, {
        message: options.message ?? "",
        noVerify: !options.verify,
      });

      // Push if requested
      if (options.push) {
        await pushBranch(options.branch, {
          remote: options.remote,
          upstream: options.upstream,
          force: options.force,
          noVerify: !options.verify,
        });
      }

      // Success path - return to original branch
      log.info(`Checking out original branch "${originalBranch}"...`);
      await checkout(originalBranch);

      log.success(
        options.push
          ? `Branch "${options.branch}" created, changes committed, and pushed to remote.`
          : `Branch "${options.branch}" created and changes committed.`
      );
    } catch (operationError) {
      // Handle operation errors with cleanup
      log.error(`Operation failed: ${operationError}`);

      // Return to original branch if we changed branches
      if (newBranchCreated) {
        try {
          log.info(`Returning to original branch "${originalBranch}"...`);
          await checkout(originalBranch);

          // Delete the new branch unless explicitly requested to keep it
          if (!options.keepBranchOnFailure) {
            log.info(`Cleaning up: Deleting branch "${options.branch}"...`);
            await deleteBranch(options.branch, true);
          } else {
            log.info(
              `Branch "${options.branch}" was kept despite the failure.`
            );
          }
        } catch (cleanupError) {
          log.error(`Error during cleanup: ${cleanupError}`);
        }
      }

      throw operationError; // Re-throw the original error
    }
  } catch (err) {
    log.error(`Branch operation failed: ${err}`);
    process.exit(1);
  } finally {
    // Final cleanup - ensure we're back on the original branch with stashed changes restored
    try {
      // Only try to switch back if we know where we came from and we're not already there
      if (originalBranch) {
        const currentBranch = await getCurrentBranch();
        if (currentBranch !== originalBranch) {
          await checkout(originalBranch);
        }
      }
    } catch (finalError) {
      log.error(`Error during final cleanup: ${finalError}`);
      log.info("Some manual cleanup may be required.");
    }
  }
};
