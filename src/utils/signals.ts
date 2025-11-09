import { log } from "./logger";
import { getIncompleteOperations } from "./state";

let isShuttingDown = false;

/**
 * Handle graceful shutdown on SIGINT (Ctrl+C) and SIGTERM
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

    // Check for incomplete operations
    const incompleteOps = getIncompleteOperations();

    if (incompleteOps.length > 0) {
      log.warn(`Found ${incompleteOps.length} incomplete operation(s).`);
      log.info("\nTo recover from incomplete operations, run:");
      log.info("  codeowners-git recover --list    # List all incomplete operations");
      log.info("  codeowners-git recover --auto    # Auto-recover most recent operation");
      log.info("  codeowners-git recover --id <id> # Recover specific operation");
    }

    process.exit(130); // Exit code 130 is standard for SIGINT
  };

  process.on("SIGINT", () => handleShutdown("SIGINT"));
  process.on("SIGTERM", () => handleShutdown("SIGTERM"));
};
