import {
  getCurrentBranch,
  createBranch,
  commitChanges,
  checkout,
  pushBranch,
  deleteBranch,
  branchExists,
  getDefaultBranch,
  hasStagedChanges,
  getStagedFiles,
  restoreFilesFromBranch,
} from "../utils/git";
import { log } from "../utils/logger";
import { getOwnerFiles } from "../utils/codeowners";
import { createPRWithTemplate } from "../utils/github";
import Table from "cli-table3";
import {
  createOperationState,
  updateOperationState,
  updateBranchState,
  completeOperation,
  failOperation,
  deleteOperationState,
  type OperationStateData,
} from "../utils/state";

export type BranchOptions = {
  include?: string; // Owner pattern to filter files (renamed from owner for consistency)
  branch?: string;
  message?: string;
  verify?: boolean;
  push?: boolean;
  remote?: string;
  upstream?: string;
  force?: boolean;
  keepBranchOnFailure?: boolean;
  isDefaultOwner?: boolean;
  append?: boolean;
  pr?: boolean;
  draftPr?: boolean;
  operationState?: OperationStateData; // For multi-branch operations
  pathPattern?: string; // Comma-separated path patterns to filter files
  exclusive?: boolean; // Only include files where owner is sole owner
  coOwned?: boolean; // Only include files with multiple owners
};

export type BranchResult = {
  success: boolean;
  branchName: string;
  owner: string;
  files: string[];
  pushed: boolean;
  prUrl?: string;
  prNumber?: number;
  error?: string;
};

export const branch = async (options: BranchOptions): Promise<BranchResult> => {
  // Variables for cleanup
  let originalBranch = "";
  let stashId: string | null = null;
  let newBranchCreated = false;
  let commitSucceeded = false;
  let filesToCommit: string[] = [];
  let prUrl: string | undefined;
  let prNumber: number | undefined;
  let pushed = false;
  let operationState: OperationStateData | null =
    options.operationState || null;
  const isSubOperation = !!options.operationState; // True if called from multi-branch
  let autoRecoverySucceeded = false;

  try {
    if (!options.branch || !options.message || !options.include) {
      throw new Error("Missing required options for branch creation");
    }

    // Validate PR options
    if ((options.pr || options.draftPr) && !options.push) {
      throw new Error("Pull request creation requires --push option");
    }

    if (options.pr && options.draftPr) {
      throw new Error("Cannot use both --pr and --draft-pr options");
    }

    // Check for staged changes
    if (await hasStagedChanges()) {
      const stagedFiles = await getStagedFiles();
      log.error("Changes need to be unstaged in order for this to work.");
      log.info("\nStaged files detected:");
      stagedFiles.forEach((file) => log.info(`  - ${file}`));
      log.info("\nTo unstage files, run:");
      log.info("  git restore --staged .");
      log.info("\nOr to unstage specific files:");
      log.info("  git restore --staged <file>");
      throw new Error(
        "Staged changes detected. Please unstage all changes before running this command."
      );
    }

    log.info(
      options.append
        ? "Starting branch update process..."
        : "Starting branch creation process..."
    );

    // Save current state
    originalBranch = await getCurrentBranch();
    log.info(`Currently on branch: ${originalBranch}`);

    // Create operation state if not a sub-operation
    if (!isSubOperation) {
      operationState = createOperationState("branch", originalBranch, {
        verify: options.verify,
        push: options.push,
        remote: options.remote,
        force: options.force,
        keepBranchOnFailure: options.keepBranchOnFailure,
        pr: options.pr,
        draftPr: options.draftPr,
      });
      log.info(`Operation ID: ${operationState.id}`);
    }

    // First, identify the files owned by the specified owner
    filesToCommit = await getOwnerFiles(
      options.include,
      options.isDefaultOwner || false,
      options.pathPattern,
      options.exclusive || false,
      options.coOwned || false
    );
    if (filesToCommit.length <= 0) {
      log.warn(
        `No files found for ${options.include}. Skipping branch creation.`
      );
      return {
        success: false,
        branchName: options.branch,
        owner: options.include,
        files: [],
        pushed: false,
        error: "No files found for this owner",
      };
    }

    log.file(`Files to be committed:\n  ${filesToCommit.join("\n  ")}`);

    // Check if branch already exists
    const branchAlreadyExists = await branchExists(options.branch);

    if (branchAlreadyExists && !options.append) {
      throw new Error(
        `Branch "${options.branch}" already exists. Use --append to add commits to it, or use a different name.`
      );
    }

    try {
      // Update state: creating branch
      if (operationState) {
        updateOperationState(operationState.id, {
          currentState: "creating-branch",
        });
        updateBranchState(operationState.id, options.branch, {
          name: options.branch,
          owner: options.include || "",
          files: filesToCommit,
          created: false,
          committed: false,
          pushed: false,
          prCreated: false,
        });
      }

      if (branchAlreadyExists && options.append) {
        // Checkout existing branch
        log.info(`Checking out existing branch "${options.branch}"...`);
        await checkout(options.branch);
      } else {
        // Create and switch to new branch
        log.info(`Creating new branch "${options.branch}"...`);
        await createBranch(options.branch);
        newBranchCreated = true;

        // Update state: branch created
        if (operationState) {
          updateBranchState(operationState.id, options.branch, {
            created: true,
          });
        }
      }

      // Commit changes
      if (operationState) {
        updateOperationState(operationState.id, { currentState: "committing" });
      }

      log.info(
        `Committing changes with message: "${options.message}" ${
          !options.verify ? "(no-verify)" : ""
        }...`
      );
      await commitChanges(filesToCommit, {
        message: options.message ?? "",
        noVerify: !options.verify,
      });
      commitSucceeded = true;

      // Update state: committed
      if (operationState) {
        updateBranchState(operationState.id, options.branch, {
          committed: true,
        });
      }

      // Push if requested
      if (options.push) {
        if (operationState) {
          updateOperationState(operationState.id, { currentState: "pushing" });
        }

        await pushBranch(options.branch, {
          remote: options.remote,
          upstream: options.upstream,
          force: options.force,
          noVerify: !options.verify,
        });
        pushed = true;

        // Update state: pushed
        if (operationState) {
          updateBranchState(operationState.id, options.branch, {
            pushed: true,
          });
        }
      }

      // Create PR if requested
      if ((options.pr || options.draftPr) && options.push) {
        try {
          if (operationState) {
            updateOperationState(operationState.id, {
              currentState: "creating-pr",
            });
          }

          const defaultBranch = await getDefaultBranch();
          const prResult = await createPRWithTemplate(
            options.message,
            options.branch,
            {
              draft: options.draftPr,
              base: defaultBranch,
            }
          );

          if (prResult) {
            prUrl = prResult.url;
            prNumber = prResult.number;
            log.success(
              `${options.draftPr ? "Draft " : ""}Pull request #${
                prResult.number
              } created: ${prResult.url}`
            );

            // Update state: PR created
            if (operationState) {
              updateBranchState(operationState.id, options.branch, {
                prCreated: true,
              });
            }
          }
        } catch (prError) {
          log.error(`Failed to create pull request: ${prError}`);
          log.info(
            "Branch was successfully created and pushed, but PR creation failed"
          );

          // Update state: PR creation failed (but don't fail the whole operation)
          if (operationState) {
            updateBranchState(operationState.id, options.branch, {
              error: `PR creation failed: ${prError}`,
            });
          }
        }
      }

      // Success path - return to original branch
      log.info(`Checking out original branch "${originalBranch}"...`);
      await checkout(originalBranch);

      // Mark operation as complete
      if (operationState && !isSubOperation) {
        completeOperation(operationState.id, true); // Delete state file on success
      }

      // Display summary (only for standalone operations, not when called from multi-branch)
      if (!isSubOperation) {
        log.header(
          options.append ? "Branch update summary" : "Branch creation summary"
        );

        const table = new Table({
          head: ["Status", "Owner", "Branch", "Files", "Pushed", "PR"],
          colWidths: [10, 25, 35, 10, 10, 50],
          wordWrap: true,
        });

        table.push([
          "✓",
          options.include,
          options.branch,
          `${filesToCommit.length} file${filesToCommit.length !== 1 ? "s" : ""}`,
          pushed ? "✓" : "-",
          prUrl || "-",
        ]);

        console.log(table.toString());

        // Show committed files
        console.log("\nFiles committed:");
        filesToCommit.forEach((file) => console.log(`  - ${file}`));
      }

      // Return success result
      return {
        success: true,
        branchName: options.branch,
        owner: options.include,
        files: filesToCommit,
        pushed,
        prUrl,
        prNumber,
      };
    } catch (operationError) {
      // Handle operation errors with cleanup
      log.error(`Operation failed: ${operationError}`);

      // Mark operation as failed
      if (operationState && !isSubOperation) {
        failOperation(operationState.id, String(operationError));
      }

      // Return to original branch if we changed branches
      if (newBranchCreated) {
        try {
          log.info(`Returning to original branch "${originalBranch}"...`);
          await checkout(originalBranch);

          // If commit succeeded, files are in the branch
          // We should restore them before deleting the branch to prevent data loss
          if (commitSucceeded) {
            log.warn(`Commit succeeded but subsequent operation failed.`);
            log.info(
              `Restoring files from branch "${options.branch}" to prevent data loss...`
            );

            try {
              await restoreFilesFromBranch(options.branch, filesToCommit);
            } catch (restoreError) {
              log.error(`Failed to restore files: ${restoreError}`);
              log.warn(`Files are still in branch "${options.branch}"`);
              log.info(`To recover files manually, run:`);
              log.info(`  git checkout ${options.branch} -- <file>`);
              // Don't delete branch if restore failed
              log.info(
                `Branch "${options.branch}" was kept to preserve your changes.`
              );
              throw operationError;
            }

            // After successfully restoring files, decide whether to delete branch
            if (!options.keepBranchOnFailure) {
              log.info(`Cleaning up: Deleting branch "${options.branch}"...`);
              await deleteBranch(options.branch, true);
              log.info(`Files have been restored to your working directory.`);
            } else {
              log.info(
                `Branch "${options.branch}" was kept despite the failure.`
              );
              log.info(`Files have been restored to your working directory.`);
            }
          } else {
            // Commit didn't succeed, safe to delete branch without restoring
            if (!options.keepBranchOnFailure) {
              log.info(`Cleaning up: Deleting branch "${options.branch}"...`);
              await deleteBranch(options.branch, true);
            } else {
              log.info(
                `Branch "${options.branch}" was kept despite the failure.`
              );
            }
          }
        } catch (cleanupError) {
          log.error(`Error during cleanup: ${cleanupError}`);
          // If cleanup failed, don't mark as recovered
          throw operationError;
        }

        // Cleanup succeeded - mark auto-recovery as successful
        autoRecoverySucceeded = true;
        log.success("Auto-recovery completed successfully");

        // Delete state file since we recovered successfully
        if (operationState && !isSubOperation) {
          deleteOperationState(operationState.id);
        }
      } else {
        // No branch was created, so nothing to clean up
        autoRecoverySucceeded = true;
        if (operationState && !isSubOperation) {
          deleteOperationState(operationState.id);
        }
      }

      throw operationError; // Re-throw the original error
    }
  } catch (err) {
    log.error(`Branch operation failed: ${err}`);

    // If called from multi-branch, return error result instead of exiting
    if (isSubOperation) {
      return {
        success: false,
        branchName: options.branch ?? "",
        owner: options.include ?? "",
        files: filesToCommit,
        pushed,
        prUrl,
        prNumber,
        error: String(err),
      };
    }

    // Provide recovery instructions for standalone operations ONLY if auto-recovery failed
    if (operationState && !autoRecoverySucceeded) {
      log.info("\nAuto-recovery failed. Manual recovery options:");
      log.info(
        `  1. Run 'codeowners-git recover --id ${operationState.id}' to clean up and return to original branch`
      );
      log.info(
        `  2. Run 'codeowners-git recover --id ${operationState.id} --keep-branches' to return without deleting branches`
      );
      log.info(
        `  3. Run 'codeowners-git recover --list' to see all incomplete operations`
      );
    }

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
