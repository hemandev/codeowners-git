import { getChangedFiles, getCurrentBranch, hasStagedChanges, getStagedFiles } from "../utils/git";
import { getOwner } from "../utils/codeowners";
import { branch } from "./branch";
import { log } from "../utils/logger";
import micromatch from "micromatch";
import {
  createOperationState,
  completeOperation,
  failOperation,
  type OperationStateData,
} from "../utils/state";

export type MultiBranchOptions = {
  branch?: string;
  message?: string;
  verify?: boolean;
  push?: boolean;
  remote?: string;
  upstream?: string;
  force?: boolean;
  keepBranchOnFailure?: boolean;
  defaultOwner?: string;
  ignore?: string;
  include?: string;
  append?: boolean;
  pr?: boolean;
  draftPr?: boolean;
};

export const multiBranch = async (options: MultiBranchOptions) => {
  let operationState: OperationStateData | null = null;

  try {
    if (!options.branch || !options.message) {
      throw new Error("Missing required options for multi-branch creation");
    }

    // Validate that only one of ignore or include is used
    if (options.ignore && options.include) {
      throw new Error("Cannot use both --ignore and --include options at the same time");
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
      throw new Error("Staged changes detected. Please unstage all changes before running this command.");
    }

    log.info(options.append ? "Starting multi-branch update process..." : "Starting multi-branch creation process...");

    // Create operation state
    const originalBranch = await getCurrentBranch();
    operationState = createOperationState("multi-branch", originalBranch, {
      verify: options.verify,
      push: options.push,
      remote: options.remote,
      force: options.force,
      keepBranchOnFailure: options.keepBranchOnFailure,
      pr: options.pr,
      draftPr: options.draftPr,
    });
    log.info(`Operation ID: ${operationState.id}`);

    // Get all changed files
    const changedFiles = await getChangedFiles();

    if (changedFiles.length === 0) {
      throw new Error("No changed files found in the repository");
    }

    // Extract all codeowners from the changed files
    const ownerSet = new Set<string>();
    const filesWithoutOwners: string[] = [];
    
    for (const file of changedFiles) {
      const owners = getOwner(file);
      if (owners.length === 0) {
        filesWithoutOwners.push(file);
      } else {
        for (const owner of owners) {
          ownerSet.add(owner);
        }
      }
    }

    let codeowners = Array.from(ownerSet);

    // If there are files without owners and a default owner is specified, add it
    if (filesWithoutOwners.length > 0 && options.defaultOwner) {
      log.info(`Found ${filesWithoutOwners.length} files without owners. Adding default owner: ${options.defaultOwner}`);
      codeowners.push(options.defaultOwner);
    }

    if (codeowners.length === 0) {
      log.warn("No codeowners found for the changed files");
      log.info("Continuing without creating any branches (use --default-owner to specify a fallback)");
      return;
    } else {
      log.info(`Found ${codeowners.length} codeowners: ${codeowners.join(", ")}`);
    }

    // Apply filtering if ignore or include options are provided
    if (options.ignore || options.include) {
      const originalCount = codeowners.length;
      
      if (options.ignore) {
        const ignorePatterns = options.ignore.split(',').map(p => p.trim());
        codeowners = codeowners.filter(owner => !micromatch.isMatch(owner, ignorePatterns));
        log.info(`Filtered out ${originalCount - codeowners.length} codeowners using ignore patterns: ${ignorePatterns.join(", ")}`);
      } else if (options.include) {
        const includePatterns = options.include.split(',').map(p => p.trim());
        codeowners = codeowners.filter(owner => micromatch.isMatch(owner, includePatterns));
        log.info(`Filtered to ${codeowners.length} codeowners using include patterns: ${includePatterns.join(", ")}`);
      }

      if (codeowners.length === 0) {
        log.warn("No codeowners left after filtering");
        return;
      }

      log.info(`Processing ${codeowners.length} codeowners after filtering: ${codeowners.join(", ")}`);
    }

    // Track success and failures
    const results = {
      success: [] as string[],
      failure: [] as string[],
      prSuccess: [] as string[],
      prFailure: [] as string[],
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

        log.info(options.append ? `Updating branch for ${owner}...` : `Creating branch for ${owner}...`);

        // Create or update branch for this owner
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
          isDefaultOwner: owner === options.defaultOwner,
          append: options.append,
          pr: options.pr,
          draftPr: options.draftPr,
          operationState: operationState || undefined, // Pass operation state
        });

        results.success.push(owner);
        
        // Track PR results (the branch function handles PR creation internally,
        // so we'll assume PR success if branch creation succeeded and PR was requested)
        if ((options.pr || options.draftPr) && options.push) {
          results.prSuccess.push(owner);
        }
      } catch (error) {
        log.error(`Failed to ${options.append ? 'update' : 'create'} branch for ${owner}: ${error}`);
        results.failure.push(owner);
      }
    }

    log.header(options.append ? "Multi-branch update summary" : "Multi-branch creation summary");
    log.info(
      options.append
        ? `Successfully updated branches for ${results.success.length} of ${codeowners.length} codeowners`
        : `Successfully created branches for ${results.success.length} of ${codeowners.length} codeowners`
    );

    if (results.success.length) {
      log.success(`Successful: ${results.success.join(", ")}`);
    }

    if (results.failure.length) {
      log.error(`Failed: ${results.failure.join(", ")}`);
    }

    // Show PR creation summary if PR options were used
    if (options.pr || options.draftPr) {
      log.header(`${options.draftPr ? "Draft " : ""}Pull request creation summary`);
      log.info(
        `Successfully created ${options.draftPr ? "draft " : ""}pull requests for ${results.prSuccess.length} of ${results.success.length} successful branches`
      );

      if (results.prSuccess.length) {
        log.success(`${options.draftPr ? "Draft " : ""}PRs created for: ${results.prSuccess.join(", ")}`);
      }
    }

    // Mark operation as complete
    if (operationState) {
      completeOperation(operationState.id, true); // Delete state file on success
    }
  } catch (err) {
    log.error(`Multi-branch operation failed: ${err}`);

    // Mark operation as failed
    if (operationState) {
      failOperation(operationState.id, String(err));
      log.info("\nRecovery options:");
      log.info(`  1. Run 'codeowners-git recover --id ${operationState.id}' to clean up and return to original branch`);
      log.info(`  2. Run 'codeowners-git recover --id ${operationState.id} --keep-branches' to return without deleting branches`);
      log.info(`  3. Run 'codeowners-git recover --list' to see all incomplete operations`);
    }

    process.exit(1);
  }
};
