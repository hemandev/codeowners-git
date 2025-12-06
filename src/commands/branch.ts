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
  type OperationStateData,
} from "../utils/state";
import { loadConfig, mergeWithCliOptions } from "../utils/config";
import { renderTemplateIfNeeded } from "../utils/template";

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
  append?: boolean;
  pr?: boolean;
  draftPr?: boolean;
  operationState?: OperationStateData; // For multi-branch operations
  pathPattern?: string; // Comma-separated path patterns to filter files
  branchPrefix?: string; // From config: prefix to prepend to branch name
  messagePrefix?: string; // From config: prefix to prepend to message
  skipConfigLoad?: boolean; // Skip loading config (used by multi-branch which already loaded it)
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

  // Load and merge config (unless called from multi-branch which already did this)
  if (!options.skipConfigLoad) {
    const config = loadConfig();
    options = mergeWithCliOptions(config, options);
  }

  // Process branch name with prefix and template
  let finalBranch = options.branch || "";
  let finalMessage = options.message || "";

  try {
    if (!options.branch || !options.message || !options.owner) {
      throw new Error("Missing required options for branch creation");
    }

    // Render template expressions in prefix (if any)
    if (options.branchPrefix) {
      const renderedPrefix = await renderTemplateIfNeeded(options.branchPrefix, options.owner);
      finalBranch = `${renderedPrefix}${options.branch}`;
    }

    if (options.messagePrefix) {
      const renderedPrefix = await renderTemplateIfNeeded(options.messagePrefix, options.owner);
      finalMessage = `${renderedPrefix} ${options.message}`;
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
      options.owner,
      options.isDefaultOwner || false,
      options.pathPattern
    );
    if (filesToCommit.length <= 0) {
      log.warn(
        `No files found for ${options.owner}. Skipping branch creation.`
      );
      return {
        success: false,
        branchName: finalBranch,
        owner: options.owner,
        files: [],
        pushed: false,
        error: "No files found for this owner",
      };
    }

    log.file(`Files to be committed:\n  ${filesToCommit.join("\n  ")}`);

    // Check if branch already exists
    const branchAlreadyExists = await branchExists(finalBranch);

    if (branchAlreadyExists && !options.append) {
      throw new Error(
        `Branch "${finalBranch}" already exists. Use --append to add commits to it, or use a different name.`
      );
    }

    try {
      // Update state: creating branch
      if (operationState) {
        updateOperationState(operationState.id, {
          currentState: "creating-branch",
        });
        updateBranchState(operationState.id, finalBranch, {
          name: finalBranch,
          owner: options.owner || "",
          files: filesToCommit,
          created: false,
          committed: false,
          pushed: false,
          prCreated: false,
        });
      }

      if (branchAlreadyExists && options.append) {
        // Checkout existing branch
        log.info(`Checking out existing branch "${finalBranch}"...`);
        await checkout(finalBranch);
      } else {
        // Create and switch to new branch
        log.info(`Creating new branch "${finalBranch}"...`);
        await createBranch(finalBranch);
        newBranchCreated = true;

        // Update state: branch created
        if (operationState) {
          updateBranchState(operationState.id, finalBranch, {
            created: true,
          });
        }
      }

      // Commit changes
      if (operationState) {
        updateOperationState(operationState.id, { currentState: "committing" });
      }

      log.info(
        `Committing changes with message: "${finalMessage}" ${
          !options.verify ? "(no-verify)" : ""
        }...`
      );
      await commitChanges(filesToCommit, {
        message: finalMessage,
        noVerify: !options.verify,
      });
      commitSucceeded = true;

      // Update state: committed
      if (operationState) {
        updateBranchState(operationState.id, finalBranch, {
          committed: true,
        });
      }

      // Push if requested
      if (options.push) {
        if (operationState) {
          updateOperationState(operationState.id, { currentState: "pushing" });
        }

        await pushBranch(finalBranch, {
          remote: options.remote,
          upstream: options.upstream,
          force: options.force,
          noVerify: !options.verify,
        });
        pushed = true;

        // Update state: pushed
        if (operationState) {
          updateBranchState(operationState.id, finalBranch, {
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
            finalMessage,
            finalBranch,
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
              updateBranchState(operationState.id, finalBranch, {
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
            updateBranchState(operationState.id, finalBranch, {
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
          options.owner,
          finalBranch,
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
        branchName: finalBranch,
        owner: options.owner,
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
              `Restoring files from branch "${finalBranch}" to prevent data loss...`
            );

            try {
              await restoreFilesFromBranch(finalBranch, filesToCommit);
            } catch (restoreError) {
              log.error(`Failed to restore files: ${restoreError}`);
              log.warn(`Files are still in branch "${finalBranch}"`);
              log.info(`To recover files manually, run:`);
              log.info(`  git checkout ${finalBranch} -- <file>`);
              // Don't delete branch if restore failed
              log.info(
                `Branch "${finalBranch}" was kept to preserve your changes.`
              );
              throw operationError;
            }

            // After successfully restoring files, decide whether to delete branch
            if (!options.keepBranchOnFailure) {
              log.info(`Cleaning up: Deleting branch "${finalBranch}"...`);
              await deleteBranch(finalBranch, true);
              log.info(`Files have been restored to your working directory.`);
            } else {
              log.info(
                `Branch "${finalBranch}" was kept despite the failure.`
              );
              log.info(`Files have been restored to your working directory.`);
            }
          } else {
            // Commit didn't succeed, safe to delete branch without restoring
            if (!options.keepBranchOnFailure) {
              log.info(`Cleaning up: Deleting branch "${finalBranch}"...`);
              await deleteBranch(finalBranch, true);
            } else {
              log.info(
                `Branch "${finalBranch}" was kept despite the failure.`
              );
            }
          }
        } catch (cleanupError) {
          log.error(`Error during cleanup: ${cleanupError}`);
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
        branchName: finalBranch,
        owner: options.owner ?? "",
        files: filesToCommit,
        pushed,
        prUrl,
        prNumber,
        error: String(err),
      };
    }

    // Provide recovery instructions for standalone operations
    if (operationState) {
      log.info("\nRecovery options:");
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
