import { log } from "../utils/logger";
import {
  getIncompleteOperations,
  loadOperationState,
  deleteOperationState,
  type OperationStateData,
} from "../utils/state";
import { getCurrentBranch, checkout, deleteBranch, branchExists } from "../utils/git";
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
 */
const performRecovery = async (
  state: OperationStateData,
  keepBranches: boolean
): Promise<void> => {
  log.header(`Recovering from operation ${state.id}`);

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

  // Step 2: Handle created branches
  if (!keepBranches && state.branches.length > 0) {
    log.info("\nCleaning up created branches...");

    for (const branch of state.branches) {
      if (branch.created) {
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

  // Step 3: Clean up state file
  log.info("\nCleaning up state file...");
  deleteOperationState(state.id);
  log.success(`State file deleted: ${state.id}`);

  log.success("\n✓ Recovery complete!");
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
