import { log } from "./logger";
import { getIncompleteOperations } from "./state";
import { getCurrentBranch, checkout } from "./git";

let isShuttingDown = false;

/**
 * Handle graceful shutdown on SIGINT (Ctrl+C) and SIGTERM
 * Attempts to return to the original branch before exiting.
 */
export const setupSignalHandlers = (): void => {
  const handleShutdown = (signal: string) => {
    if (isShuttingDown) {
      // Force exit if user hits Ctrl+C again
      log.warn("\nForce exiting...");
      process.exit(1);
    }

    isShuttingDown = true;

    log.warn(`\n\nReceived ${signal}. Gracefully shutting down...`);

    // Check for incomplete operations and attempt minimal recovery
    const incompleteOps = getIncompleteOperations();

    if (incompleteOps.length === 0) {
      process.exit(130);
      return;
    }

    const mostRecent = incompleteOps[0];
    log.warn(`Found ${incompleteOps.length} incomplete operation(s).`);

    // Attempt to return to the original branch (minimal safe recovery)
    // Use promise chain to ensure we wait for async git operations before exiting
    getCurrentBranch()
      .then((currentBranch) => {
        if (currentBranch !== mostRecent.originalBranch) {
          log.info(`Returning to original branch: ${mostRecent.originalBranch}...`);
          return checkout(mostRecent.originalBranch).then(() => {
            log.success(`Returned to ${mostRecent.originalBranch}`);
          });
        }
      })
      .catch(() => {
        log.warn("Could not return to original branch automatically.");
      })
      .finally(() => {
        log.info("\nTo fully recover from incomplete operations, run:");
        log.info("  codeowners-git recover --auto    # Auto-recover most recent operation");
        log.info("  codeowners-git recover --list    # List all incomplete operations");
        process.exit(130); // Exit code 130 is standard for SIGINT
      });
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
};
