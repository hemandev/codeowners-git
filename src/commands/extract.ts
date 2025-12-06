import {
  hasStagedChanges,
  getStagedFiles,
  getBaseBranch,
  getChangedFilesBetween,
  extractFilesFromRef,
  getDefaultBranch,
} from "../utils/git";
import { log } from "../utils/logger";
import { getOwner } from "../utils/codeowners";
import {
  matchOwnerPattern,
  matchOwnersExclusive,
  filterByPathPatterns,
} from "../utils/matcher";

export type ExtractOptions = {
  source: string; // Required: branch or commit to extract from
  owner?: string; // Optional: micromatch pattern for owner filtering
  compareMain?: boolean; // Compare source vs main instead of merge-base
  pathPattern?: string; // Optional: path pattern to filter files
  exclusive?: boolean; // Only include files where owner is sole owner
  coOwned?: boolean; // Only include files with multiple owners
};

export const extract = async (options: ExtractOptions): Promise<void> => {
  try {
    if (!options.source) {
      log.error("Missing required option: --source");
      log.info("\nUsage:");
      log.info("  cg extract -s <branch-or-commit>");
      log.info("\nExamples:");
      log.info("  cg extract -s feature/other-branch");
      log.info("  cg extract -s feature/other-branch -o '@team-*'");
      log.info("  cg extract -s abc123def --compare-main");
      process.exit(1);
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
      process.exit(1);
    }

    log.info("Starting file extraction process...");

    // Determine comparison target
    let compareTarget: string | undefined;
    if (options.compareMain) {
      compareTarget = await getDefaultBranch();
      log.info(`Comparing ${options.source} against ${compareTarget}...`);
    } else {
      const baseBranch = await getBaseBranch(options.source);
      compareTarget = baseBranch;
      log.info(`Detected base branch: ${baseBranch}`);
      log.info(`Extracting changes from ${options.source}...`);
    }

    // Get changed files from source
    let changedFiles = await getChangedFilesBetween(options.source, compareTarget);

    if (changedFiles.length === 0) {
      log.warn(`No changed files found in ${options.source}`);
      return;
    }

    log.info(`Found ${changedFiles.length} changed file${changedFiles.length !== 1 ? 's' : ''}`);

    // Apply path filtering if specified
    if (options.pathPattern) {
      changedFiles = filterByPathPatterns(changedFiles, options.pathPattern);
      log.info(`Filtered to ${changedFiles.length} file${changedFiles.length !== 1 ? 's' : ''} matching pattern: ${options.pathPattern}`);

      if (changedFiles.length === 0) {
        log.warn(`No files match the path pattern: ${options.pathPattern}`);
        return;
      }
    }

    // Filter by owner and/or co-owned flag
    let filesToExtract = changedFiles;

    // When --co-owned is used without --owner, filter to files with 2+ owners
    if (options.coOwned && !options.owner) {
      log.info('Filtering to co-owned files (2+ owners)');
      filesToExtract = changedFiles.filter((file) => {
        const owners = getOwner(file);
        return owners.length > 1;
      });

      if (filesToExtract.length === 0) {
        log.warn('No co-owned files found');
        return;
      }

      log.info(`Filtered to ${filesToExtract.length} co-owned file${filesToExtract.length !== 1 ? 's' : ''}`);
    }

    if (options.owner) {
      log.info(`Filtering files by owner pattern: ${options.owner}${options.exclusive ? ' (exclusive)' : ''}${options.coOwned ? ' (co-owned)' : ''}`);

      const ownedFiles: string[] = [];
      for (const file of filesToExtract) {
        const owners = getOwner(file);
        if (owners.length > 0) {
          // Co-owned filter: only files with multiple owners
          if (options.coOwned && owners.length < 2) {
            continue;
          }
          let matches: boolean;
          if (options.exclusive) {
            // Exclusive: all owners must match the pattern
            matches = matchOwnersExclusive(owners, options.owner);
          } else {
            // Default: any owner matches the pattern
            matches = owners.some((owner) =>
              matchOwnerPattern(owner, options.owner!)
            );
          }
          if (matches) {
            ownedFiles.push(file);
          }
        }
      }

      filesToExtract = ownedFiles;

      if (filesToExtract.length === 0) {
        log.warn(`No files match the owner pattern: ${options.owner}`);
        return;
      }

      log.info(`Filtered to ${filesToExtract.length} file${filesToExtract.length !== 1 ? 's' : ''}`);
    }

    // Extract files to working directory (unstaged)
    log.info("Extracting files to working directory...");
    await extractFilesFromRef(options.source, filesToExtract);

    log.success(`\n✓ Extracted ${filesToExtract.length} file${filesToExtract.length !== 1 ? 's' : ''} to working directory (unstaged)`);

    // Show extracted files
    log.info("\nExtracted files:");
    filesToExtract.forEach((file) => log.info(`  - ${file}`));

    log.info("\nNext steps:");
    log.info("  - Review the extracted files in your working directory");
    log.info("  - Use 'cg branch' command to create a branch and commit");
    log.info("  - Example: cg branch -o @my-team -b my-branch -m 'Commit message' -p");
  } catch (err) {
    log.error(`\n✗ Extraction failed: ${err}`);
    process.exit(1);
  }
};
