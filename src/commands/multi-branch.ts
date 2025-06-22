import { getChangedFiles } from "../utils/git";
import { getOwner } from "../utils/codeowners";
import { branch } from "./branch";
import { log } from "../utils/logger";
import micromatch from "micromatch";

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
};

export const multiBranch = async (options: MultiBranchOptions) => {
  try {
    if (!options.branch || !options.message) {
      throw new Error("Missing required options for multi-branch creation");
    }

    // Validate that only one of ignore or include is used
    if (options.ignore && options.include) {
      throw new Error("Cannot use both --ignore and --include options at the same time");
    }

    log.info("Starting multi-branch creation process...");

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
          isDefaultOwner: owner === options.defaultOwner,
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
