import {
  hasUnstagedChanges,
  getUnstagedFiles,
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
import Table from "cli-table3";
import chalk from "chalk";

export type ExtractOptions = {
  source: string; // Required: branch or commit to extract from
  include?: string; // Optional: micromatch pattern for owner filtering (renamed from owner for consistency)
  compareMain?: boolean; // Compare source vs main instead of merge-base
  pathPattern?: string; // Optional: path pattern to filter files
  exclusive?: boolean; // Only include files where owner is sole owner
  coOwned?: boolean; // Only include files with multiple owners
  dryRun?: boolean; // Preview the operation without making any changes
};

export const extract = async (options: ExtractOptions): Promise<void> => {
  try {
    if (!options.source) {
      log.error("Missing required option: --source");
      log.info("\nUsage:");
      log.info("  cg extract -s <branch-or-commit>");
      log.info("\nExamples:");
      log.info("  cg extract -s feature/other-branch");
      log.info("  cg extract -s feature/other-branch -i '@team-*'");
      log.info("  cg extract -s abc123def --compare-main");
      process.exit(1);
    }

    // Warn about unstaged changes that will be ignored
    if (await hasUnstagedChanges()) {
      const unstagedFiles = await getUnstagedFiles();
      log.warn("Warning: Unstaged changes detected (these will be ignored):");
      unstagedFiles.forEach((file) => log.warn(`  - ${file}`));
      log.info("\nOnly staged files will be processed.");
      log.info("To stage files: git add <file>");
      log.info("");
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

    // When --co-owned is used without --include, filter to files with 2+ owners
    if (options.coOwned && !options.include) {
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

    if (options.include) {
      log.info(`Filtering files by owner pattern: ${options.include}${options.exclusive ? ' (exclusive)' : ''}${options.coOwned ? ' (co-owned)' : ''}`);

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
            matches = matchOwnersExclusive(owners, options.include);
          } else {
            // Default: any owner matches the pattern
            matches = owners.some((owner) =>
              matchOwnerPattern(owner, options.include!)
            );
          }
          if (matches) {
            ownedFiles.push(file);
          }
        }
      }

      filesToExtract = ownedFiles;

      if (filesToExtract.length === 0) {
        log.warn(`No files match the owner pattern: ${options.include}`);
        return;
      }

      log.info(`Filtered to ${filesToExtract.length} file${filesToExtract.length !== 1 ? 's' : ''}`);
    }

    // Dry-run: show a complete summary and exit without extracting
    if (options.dryRun) {
      const excludedFiles = changedFiles.filter(
        (f) => !filesToExtract.includes(f)
      );

      log.header("Dry Run Preview — extract");
      console.log("");

      // Operation details table
      const detailsTable = new Table({
        style: { head: ["cyan"] },
        wordWrap: true,
      });
      detailsTable.push(
        { [chalk.bold("Source")]: options.source },
        {
          [chalk.bold("Compare target")]: compareTarget || "auto-detected",
        },
        {
          [chalk.bold("Files in source")]: `${changedFiles.length} changed file${changedFiles.length !== 1 ? "s" : ""}`,
        },
        {
          [chalk.bold("Files to extract")]: `${filesToExtract.length} file${filesToExtract.length !== 1 ? "s" : ""}`,
        },
        {
          [chalk.bold("Files excluded")]: `${excludedFiles.length} file${excludedFiles.length !== 1 ? "s" : ""} (filtered out)`,
        }
      );
      if (options.include) {
        detailsTable.push({
          [chalk.bold("Owner filter")]: `${options.include}${options.exclusive ? " (exclusive)" : ""}`,
        });
      }
      if (options.pathPattern) {
        detailsTable.push({
          [chalk.bold("Path filter")]: options.pathPattern,
        });
      }
      if (options.coOwned) {
        detailsTable.push({
          [chalk.bold("Co-owned mode")]:
            "Yes (only files with multiple owners)",
        });
      }
      console.log(detailsTable.toString());

      // Files to be extracted
      console.log(
        chalk.bold.green(
          `\nFiles to be extracted (${filesToExtract.length}):`
        )
      );
      filesToExtract.forEach((file) =>
        console.log(`  ${chalk.green("+")} ${file}`)
      );

      // Excluded files
      if (excludedFiles.length > 0) {
        console.log(
          chalk.bold.dim(
            `\nExcluded files (${excludedFiles.length}):`
          )
        );
        excludedFiles.forEach((file) =>
          console.log(`  ${chalk.dim("-")} ${chalk.dim(file)}`)
        );
      }

      console.log("");
      return;
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
    log.info("  - Example: cg branch -i @my-team -b my-branch -m 'Commit message' -p");
  } catch (err) {
    log.error(`\n✗ Extraction failed: ${err}`);
    process.exit(1);
  }
};
