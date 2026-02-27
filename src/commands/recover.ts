import { log } from "../utils/logger";
import {
  getIncompleteOperations,
  loadOperationState,
  deleteOperationState,
  type OperationStateData,
} from "../utils/state";
import { getCurrentBranch, checkout, deleteBranch, branchExists, restoreFilesFromBranch, hasUnstagedChanges, hasStagedChanges } from "../utils/git";
import { select, confirm } from "@inquirer/prompts";

export type RecoverOptions = {
  id?: string;
  keepBranches?: boolean;
  list?: boolean;
  auto?: boolean;
};

/**
 * Format branch state for display
 */
const formatBranchState = (state: OperationStateData): string => {
  const lines: string[] = [];

  for (const branch of state.branches) {
    const status: string[] = [];
    if (branch.created) status.push("✓ created");
    if (branch.committed) status.push("✓ committed");
    if (branch.pushed) status.push("✓ pushed");
    if (branch.prCreated) status.push("✓ PR created");
    if (branch.error) status.push(`✗ error: ${branch.error}`);

    lines.push(`  - ${branch.name} (${branch.owner}): ${status.join(", ")}`);
  }

  return lines.join("\n");
};

/**
 * Display incomplete operations
 */
const displayIncompleteOperations = (operations: OperationStateData[]): void => {
  if (operations.length === 0) {
    log.success("No incomplete operations found.");
    return;
  }

  log.header("Incomplete Operations");

  for (const op of operations) {
    const date = new Date(op.timestamp).toLocaleString();
    log.info(`\nOperation ID: ${op.id}`);
    log.info(`Type: ${op.operation}`);
    log.info(`Started: ${date}`);
    log.info(`State: ${op.currentState}`);
    log.info(`Original branch: ${op.originalBranch}`);
    log.info(`Branches (${op.branches.length}):`);
    log.info(formatBranchState(op));
  }
};

/**
 * Perform recovery for a specific operation
 * Returns true if recovery completed successfully, false if there were warnings
 */
export const performRecovery = async (
  state: OperationStateData,
  keepBranches: boolean,
  options?: { skipDirtyCheck?: boolean }
): Promise<boolean> => {
  log.header(`Recovering from operation ${state.id}`);
  let hadWarnings = false;

  // Check for uncommitted changes that could be overwritten during recovery
  // Skip this check during auto-recovery (called internally after a failed operation)
  if (!options?.skipDirtyCheck) {
    const hasUnstaged = await hasUnstagedChanges();
    const hasStaged = await hasStagedChanges();

    if (hasUnstaged || hasStaged) {
      log.warn("Working directory has uncommitted changes.");
      log.warn("Recovery may overwrite files in your working directory.");
      log.info("Consider committing or stashing your changes first:");
      log.info("  git stash push -m 'before recovery'");
      throw new Error("Working directory is not clean. Commit or stash changes before recovering.");
    }
  }

  // Track branches where file restoration failed — these must NOT be deleted
  const branchesWithRestoreFailure = new Set<string>();

  const currentBranch = await getCurrentBranch();

  // Step 1: Return to original branch
  if (currentBranch !== state.originalBranch) {
    try {
      log.info(`Returning to original branch: ${state.originalBranch}`);
      await checkout(state.originalBranch);
      log.success(`Switched back to ${state.originalBranch}`);
    } catch (error) {
      log.error(`Failed to checkout original branch: ${error}`);
      log.info(`You may need to manually run: git checkout ${state.originalBranch}`);
      throw error;
    }
  } else {
    log.info(`Already on original branch: ${state.originalBranch}`);
  }

  // Step 2: Restore files from committed branches before deleting them
  if (!keepBranches && state.branches.length > 0) {
    log.info("\nRestoring files from branches...");

    for (const branch of state.branches) {
      if (branch.committed && branch.files && branch.files.length > 0) {
        try {
          const exists = await branchExists(branch.name);
          if (exists) {
            log.info(`Restoring ${branch.files.length} file(s) from ${branch.name}...`);
            await restoreFilesFromBranch(branch.name, branch.files);
          } else {
            log.warn(`Branch ${branch.name} no longer exists, cannot restore files`);
            hadWarnings = true;
          }
        } catch (error) {
          log.error(`Failed to restore files from ${branch.name}: ${error}`);
          log.warn(`Branch ${branch.name} will be kept to prevent data loss`);
          branchesWithRestoreFailure.add(branch.name);
          hadWarnings = true;
        }
      }
    }
  }

  // Step 3: Handle created branches (delete or keep)
  if (!keepBranches && state.branches.length > 0) {
    log.info("\nCleaning up created branches...");

    for (const branch of state.branches) {
      if (branch.created) {
        // Skip deletion for branches where file restoration failed
        if (branchesWithRestoreFailure.has(branch.name)) {
          log.warn(`Skipping deletion of ${branch.name} — file restoration failed, branch preserved to prevent data loss`);
          log.info(`  To recover files manually: git checkout ${branch.name} -- <file>`);
          log.info(`  To delete manually when done: git branch -D ${branch.name}`);
          continue;
        }

        try {
          const exists = await branchExists(branch.name);

          if (exists) {
            await deleteBranch(branch.name, true);
            log.success(`Deleted branch: ${branch.name}`);
          } else {
            log.info(`Branch ${branch.name} does not exist (already deleted)`);
          }
        } catch (error) {
          log.error(`Failed to delete branch ${branch.name}: ${error}`);
          log.info(`You may need to manually run: git branch -D ${branch.name}`);
          hadWarnings = true;
        }
      }
    }
  } else if (keepBranches && state.branches.length > 0) {
    log.info("\nKeeping created branches:");
    for (const branch of state.branches) {
      if (branch.created) {
        log.info(`  - ${branch.name}`);
      }
    }
  }

  // Step 4: Clean up state file
  log.info("\nCleaning up state file...");
  deleteOperationState(state.id);
  log.success(`State file deleted: ${state.id}`);

  log.success("\n✓ Recovery complete!");
  return !hadWarnings;
};

/**
 * Recover from failed or incomplete operations
 */
export const recover = async (options: RecoverOptions): Promise<void> => {
  try {
    const incompleteOps = getIncompleteOperations();

    // List mode
    if (options.list) {
      displayIncompleteOperations(incompleteOps);
      return;
    }

    // No incomplete operations
    if (incompleteOps.length === 0) {
      log.success("No incomplete operations found. Nothing to recover.");
      return;
    }

    // Determine which operation to recover
    let operationToRecover: OperationStateData | null = null;

    if (options.id) {
      // Specific operation ID provided
      operationToRecover = loadOperationState(options.id);

      if (!operationToRecover) {
        log.error(`Operation with ID ${options.id} not found.`);
        log.info("Run 'codeowners-git recover --list' to see available operations.");
        process.exit(1);
      }
    } else if (incompleteOps.length === 1) {
      // Only one incomplete operation
      operationToRecover = incompleteOps[0];
      log.info(`Found 1 incomplete operation: ${operationToRecover.id}`);
    } else if (options.auto) {
      // Auto mode: recover the most recent one
      operationToRecover = incompleteOps[0];
      log.info(`Auto-recovering most recent operation: ${operationToRecover.id}`);
    } else {
      // Multiple operations, prompt user to select
      log.info(`Found ${incompleteOps.length} incomplete operations.`);

      const choices = incompleteOps.map((op) => ({
        name: `${op.id.substring(0, 8)}... - ${op.operation} (${new Date(op.timestamp).toLocaleString()}) - ${op.branches.length} branches`,
        value: op.id,
      }));

      const selectedId = await select({
        message: "Select operation to recover:",
        choices,
      });

      operationToRecover = loadOperationState(selectedId);
    }

    if (!operationToRecover) {
      log.error("Failed to load operation state.");
      process.exit(1);
    }

    // Display operation details
    log.info("\nOperation details:");
    displayIncompleteOperations([operationToRecover]);

    // Confirm recovery unless in auto mode
    if (!options.auto) {
      const shouldProceed = await confirm({
        message: options.keepBranches
          ? "Proceed with recovery? (branches will be kept)"
          : "Proceed with recovery? (created branches will be deleted)",
        default: true,
      });

      if (!shouldProceed) {
        log.info("Recovery cancelled.");
        return;
      }
    }

    // Perform recovery
    await performRecovery(operationToRecover, options.keepBranches || false);
  } catch (error) {
    log.error(`Recovery failed: ${error}`);
    process.exit(1);
  }
};
