import {
  getChangedFiles,
  getCurrentBranch,
  hasUnstagedChanges,
  getUnstagedFiles,
  getDefaultBranch,
  getChangedFilesBetween,
  extractFilesFromRef,
  stageFiles,
  checkout,
  createBranch as createGitBranch,
  deleteBranch,
  hasStagedChanges,
} from "../utils/git";
import { getOwner, getOwnerFiles } from "../utils/codeowners";
import { branch, type BranchResult } from "./branch";
import { performRecovery } from "./recover";
import { log, setSilent, outputJson } from "../utils/logger";
import Table from "cli-table3";
import chalk from "chalk";
import { filterByPathPatterns, matchOwnerPattern } from "../utils/matcher";
import {
  createOperationState,
  completeOperation,
  failOperation,
  loadOperationState,
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
  pathPattern?: string; // Comma-separated path patterns to filter files
  exclusive?: boolean; // Only include files where owner is sole owner
  coOwned?: boolean; // Only include files with multiple owners
  dryRun?: boolean; // Preview the operation without making any changes
  json?: boolean; // Output results as JSON
  source?: string; // Source branch or commit to extract changes from
  compareMain?: boolean; // Compare source against main instead of detecting merge-base
  prBody?: string; // Custom PR body text (overrides template)
};

export const multiBranch = async (options: MultiBranchOptions) => {
  let operationState: OperationStateData | null = null;
  let tempBranch: string | null = null;
  let sourceOriginalBranch: string | null = null;

  // Enable silent mode when JSON output is requested
  if (options.json) {
    setSilent(true);
  }

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

    // When --source is provided, set up a temp branch with extracted files
    if (options.source) {
      // Reject if user also has staged changes (ambiguous intent)
      if (await hasStagedChanges()) {
        throw new Error(
          "Cannot use --source when there are staged changes. " +
          "Either commit/unstage your changes first, or omit --source to use staged files."
        );
      }

      sourceOriginalBranch = await getCurrentBranch();
      log.info(`Extracting changes from source: ${options.source}`);

      // Determine the base to compare against
      const defaultBranch = await getDefaultBranch();
      const compareTarget = options.compareMain ? defaultBranch : undefined;

      if (compareTarget) {
        log.info(`Comparing ${options.source} against ${compareTarget}...`);
      }

      // Get changed files from the source ref
      let sourceFiles = await getChangedFilesBetween(options.source, compareTarget);

      if (sourceFiles.length === 0) {
        throw new Error(`No changed files found in ${options.source}`);
      }

      // Apply path filtering early
      sourceFiles = filterByPathPatterns(sourceFiles, options.pathPattern);

      if (sourceFiles.length === 0) {
        throw new Error(
          options.pathPattern
            ? `No changed files found matching pattern: ${options.pathPattern}`
            : `No changed files found in ${options.source}`
        );
      }

      log.info(`Found ${sourceFiles.length} changed file${sourceFiles.length !== 1 ? "s" : ""} in source`);

      // Create a temporary branch off the default branch
      tempBranch = `cg-temp-${Date.now()}`;
      log.info(`Creating temporary branch "${tempBranch}" from "${defaultBranch}"...`);
      await checkout(defaultBranch);
      await createGitBranch(tempBranch);

      // Extract file contents from the source ref into the working directory
      log.info("Extracting files from source...");
      await extractFilesFromRef(options.source, sourceFiles);

      // Stage the extracted files
      await stageFiles(sourceFiles);

      log.info("Files extracted and staged on temporary branch. Proceeding with multi-branch split...\n");
    }

    // Warn about unstaged changes that will be ignored (skip when using --source)
    if (!options.source && await hasUnstagedChanges()) {
      const unstagedFiles = await getUnstagedFiles();
      log.warn("Warning: Unstaged changes detected (these will be ignored):");
      unstagedFiles.forEach((file) => log.warn(`  - ${file}`));
      log.info("\nOnly staged files will be processed.");
      log.info("To stage files: git add <file>");
      log.info("");
    }

    log.info(options.append ? "Starting multi-branch update process..." : "Starting multi-branch creation process...");

    // Create operation state
    // When using --source, the "original branch" is the temp branch (where staged files live)
    // We track the real original branch separately for cleanup
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
    let changedFiles = await getChangedFiles();

    // Apply path filtering (returns all files if no pattern)
    // When --source is used, path filtering was already applied above, but
    // getChangedFiles() re-reads from the index so this is still correct
    changedFiles = filterByPathPatterns(changedFiles, options.pathPattern);

    if (changedFiles.length === 0) {
      throw new Error(
        options.pathPattern
          ? `No changed files found matching pattern: ${options.pathPattern}`
          : "No changed files found in the repository"
      );
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
        // Use matchOwnerPattern for consistent slash normalization
        codeowners = codeowners.filter(owner => !matchOwnerPattern(owner, options.ignore!));
        log.info(`Filtered out ${originalCount - codeowners.length} codeowners using ignore patterns: ${options.ignore}`);
      } else if (options.include) {
        // Use matchOwnerPattern for consistent slash normalization
        codeowners = codeowners.filter(owner => matchOwnerPattern(owner, options.include!));
        log.info(`Filtered to ${codeowners.length} codeowners using include patterns: ${options.include}`);
      }

      if (codeowners.length === 0) {
        log.warn("No codeowners left after filtering");
        return;
      }

      log.info(`Processing ${codeowners.length} codeowners after filtering: ${codeowners.join(", ")}`);
    }

    // Dry-run: show a complete summary for all owners and exit
    if (options.dryRun) {
      // Collect per-owner file breakdowns (shared between JSON and table output)
      type OwnerPreview = {
        owner: string;
        branchName: string;
        commitMessage: string;
        files: string[];
      };
      const previews: OwnerPreview[] = [];
      const allCoveredFiles = new Set<string>();

      for (const owner of codeowners) {
        const sanitizedOwner = owner
          .replace(/[^a-zA-Z0-9-_@]/g, "-")
          .replace(/^@/, "");
        const branchName = `${options.branch}/${sanitizedOwner}`;
        const commitMessage = `${options.message} - ${owner}`;

        const ownerFiles = await getOwnerFiles(
          owner,
          owner === options.defaultOwner,
          options.pathPattern,
          options.exclusive || false,
          options.coOwned || false
        );

        for (const f of ownerFiles) allCoveredFiles.add(f);

        previews.push({
          owner,
          branchName,
          commitMessage,
          files: ownerFiles,
        });
      }

      const uncoveredFiles = changedFiles.filter(
        (f) => !allCoveredFiles.has(f)
      );

      // JSON dry-run output
      if (options.json) {
        outputJson({
          command: "multi-branch",
          dryRun: true,
          owners: previews.map((p) => ({
            owner: p.owner,
            branch: p.branchName,
            message: p.commitMessage,
            files: p.files,
          })),
          uncoveredFiles,
          filesWithoutOwners: options.defaultOwner ? [] : filesWithoutOwners,
          totalFiles: changedFiles.length,
          coveredFiles: allCoveredFiles.size,
          options: {
            baseBranch: options.branch,
            baseMessage: options.message,
            push: options.push || false,
            remote: options.remote || "origin",
            force: options.force || false,
            pr: options.pr || false,
            draftPr: options.draftPr || false,
            noVerify: !options.verify,
            append: options.append || false,
            exclusive: options.exclusive || false,
            coOwned: options.coOwned || false,
            pathPattern: options.pathPattern || null,
            defaultOwner: options.defaultOwner || null,
          },
        });
        return;
      }

      log.header("Dry Run Preview — multi-branch");
      console.log("");

      // Global settings table
      const settingsTable = new Table({
        style: { head: ["cyan"] },
        wordWrap: true,
      });
      settingsTable.push(
        { [chalk.bold("Base branch name")]: options.branch },
        { [chalk.bold("Base commit message")]: options.message },
        { [chalk.bold("Total codeowners")]: `${codeowners.length}` },
        { [chalk.bold("No-verify")]: !options.verify ? "Yes" : "No" },
        {
          [chalk.bold("Push")]: options.push
            ? `Yes → ${options.remote || "origin"}${options.force ? " (force)" : ""}`
            : "No",
        },
        {
          [chalk.bold("Pull request")]: options.pr
            ? "Yes"
            : options.draftPr
              ? "Yes (draft)"
              : "No",
        },
        { [chalk.bold("Append mode")]: options.append ? "Yes" : "No" }
      );
      if (options.pathPattern) {
        settingsTable.push({
          [chalk.bold("Path filter")]: options.pathPattern,
        });
      }
      if (options.exclusive) {
        settingsTable.push({
          [chalk.bold("Exclusive mode")]: "Yes (only files solely owned by each owner)",
        });
      }
      if (options.coOwned) {
        settingsTable.push({
          [chalk.bold("Co-owned mode")]: "Yes (only files with multiple owners)",
        });
      }
      if (options.defaultOwner) {
        settingsTable.push({
          [chalk.bold("Default owner")]: options.defaultOwner,
        });
      }
      console.log(settingsTable.toString());
      console.log("");

      // Summary table of all branches
      const summaryTable = new Table({
        head: ["Owner", "Branch", "Files", "Commit Message"],
        colWidths: [22, 35, 8, 45],
        wordWrap: true,
        style: { head: ["cyan"] },
      });

      for (const p of previews) {
        summaryTable.push([
          p.owner,
          p.branchName,
          `${p.files.length}`,
          p.commitMessage,
        ]);
      }

      console.log(summaryTable.toString());

      // Per-owner file details
      console.log(chalk.bold.cyan("\nFiles by branch:"));
      for (const p of previews) {
        if (p.files.length > 0) {
          console.log(
            `\n${chalk.bold(p.branchName)} ${chalk.dim(`(${p.owner})`)} — ${p.files.length} file${p.files.length !== 1 ? "s" : ""}:`
          );
          p.files.forEach((file) =>
            console.log(`  ${chalk.green("+")} ${file}`)
          );
        } else {
          console.log(
            `\n${chalk.bold(p.branchName)} ${chalk.dim(`(${p.owner})`)} — ${chalk.yellow("0 files (branch will be skipped)")}`
          );
        }
      }

      // Uncovered files (staged files not matched by any owner)
      if (uncoveredFiles.length > 0) {
        console.log(
          chalk.bold.yellow(
            `\nUncovered staged files (${uncoveredFiles.length}) — not included in any branch:`
          )
        );
        uncoveredFiles.forEach((file) =>
          console.log(`  ${chalk.yellow("!")} ${file}`)
        );
      }

      // Files without owners
      if (filesWithoutOwners.length > 0 && !options.defaultOwner) {
        console.log(
          chalk.bold.yellow(
            `\nFiles without CODEOWNERS (${filesWithoutOwners.length}):`
          )
        );
        filesWithoutOwners.forEach((file) =>
          console.log(`  ${chalk.yellow("?")} ${file}`)
        );
        console.log(
          chalk.dim(
            "  Tip: Use --default-owner <owner> to assign these files"
          )
        );
      }

      // Totals
      console.log(chalk.bold.cyan("\nSummary:"));
      console.log(`  Branches to create: ${chalk.bold(`${previews.length}`)}`);
      console.log(
        `  Total files covered: ${chalk.bold(`${allCoveredFiles.size}`)} of ${changedFiles.length} staged`
      );
      if (uncoveredFiles.length > 0) {
        console.log(
          `  Uncovered files:     ${chalk.yellow(`${uncoveredFiles.length}`)}`
        );
      }
      console.log("");

      return;
    }

    // Track detailed results for each branch
    const results: BranchResult[] = [];

    // Process each codeowner
    for (const owner of codeowners) {
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
      const result = await branch({
        include: owner,
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
        pathPattern: options.pathPattern, // Pass path pattern
        exclusive: options.exclusive, // Pass exclusive flag
        coOwned: options.coOwned, // Pass co-owned flag
        json: options.json, // Pass json flag (for silent push)
        prBody: options.prBody, // Pass custom PR body
      });

      results.push(result);
    }

    // Display detailed summary table
    const successCount = results.filter(r => r.success).length;
    const failureCount = results.filter(r => !r.success).length;

    log.header(options.append ? "Multi-branch update summary" : "Multi-branch creation summary");
    log.info(
      options.append
        ? `Successfully updated ${successCount} of ${codeowners.length} branches`
        : `Successfully created ${successCount} of ${codeowners.length} branches`
    );

    if (failureCount > 0) {
      log.error(`Failed: ${failureCount} branches`);
    }

    console.log(""); // Empty line before table

    // Create detailed table
    const table = new Table({
      head: ['Status', 'Owner', 'Branch', 'Files', 'Pushed', 'PR'],
      colWidths: [10, 20, 40, 10, 10, 50],
      wordWrap: true,
    });

    for (const result of results) {
      const status = result.success ? '✓' : '✗';
      const fileCount = result.files.length;
      const pushedStatus = result.pushed ? '✓' : '-';
      const prInfo = result.prUrl
        ? result.prUrl
        : result.error && result.error.includes('PR creation failed')
        ? 'Failed'
        : '-';

      table.push([
        status,
        result.owner,
        result.branchName,
        `${fileCount} file${fileCount !== 1 ? 's' : ''}`,
        pushedStatus,
        prInfo,
      ]);
    }

    console.log(table.toString());

    // Show summary of files per branch if there are any results
    if (results.length > 0) {
      console.log("\nFiles by branch:");
      for (const result of results) {
        if (result.success && result.files.length > 0) {
          console.log(`\n${result.branchName} (${result.owner}):`);
          result.files.forEach(file => console.log(`  - ${file}`));
        }
      }
    }

    // Show errors if any
    const errors = results.filter(r => r.error);
    if (errors.length > 0) {
      console.log("\nErrors:");
      errors.forEach(result => {
        console.log(`\n${result.branchName} (${result.owner}):`);
        console.log(`  ${result.error}`);
      });
    }

    // Mark operation as complete or failed based on results
    if (operationState) {
      if (failureCount === 0) {
        completeOperation(operationState.id, true); // Delete state file on full success
      } else {
        // Keep state file for reference if there were any failures
        failOperation(operationState.id, `${failureCount} branch(es) failed`);
        log.info(`\nNote: ${failureCount} branch(es) failed. Files were auto-restored to working directory.`);
        log.info(`State preserved for reference. Run 'codeowners-git recover --id ${operationState.id}' if needed.`);
      }
    }

    // JSON output for normal execution
    if (options.json) {
      outputJson({
        command: "multi-branch",
        dryRun: false,
        success: failureCount === 0,
        totalOwners: codeowners.length,
        successCount,
        failureCount,
        results: results.map((r) => ({
          owner: r.owner,
          branch: r.branchName,
          success: r.success,
          files: r.files,
          pushed: r.pushed,
          prUrl: r.prUrl || null,
          prNumber: r.prNumber || null,
          error: r.error || null,
        })),
      });
    }
  } catch (err) {
    // JSON error output
    if (options.json) {
      outputJson({
        command: "multi-branch",
        dryRun: false,
        success: false,
        error: String(err),
      });
      process.exit(1);
    }

    log.error(`Multi-branch operation failed: ${err}`);

    // Auto-recover if we have operation state
    if (operationState) {
      log.info("\nAttempting auto-recovery...");

      // Refresh state to get latest branch info
      const currentState = loadOperationState(operationState.id);

      if (currentState) {
        try {
          const recovered = await performRecovery(currentState, false, { skipDirtyCheck: true });
          if (recovered) {
            log.success("Auto-recovery completed successfully");
          } else {
            log.warn("Auto-recovery completed with warnings");
          }
        } catch (recoveryError) {
          log.error(`Auto-recovery failed: ${recoveryError}`);
          log.info("\nManual recovery options:");
          log.info(`  1. Run 'codeowners-git recover --id ${operationState.id}' to clean up`);
          log.info(`  2. Run 'codeowners-git recover --list' to see all operations`);
        }
      }
    }

    process.exit(1);
  } finally {
    // Clean up temporary branch created for --source flow
    if (tempBranch) {
      try {
        // Return to the original branch first
        if (sourceOriginalBranch) {
          const currentBranch = await getCurrentBranch();
          if (currentBranch !== sourceOriginalBranch) {
            log.info(`Returning to original branch "${sourceOriginalBranch}"...`);
            await checkout(sourceOriginalBranch);
          }
        }

        // Delete the temporary branch
        log.info(`Cleaning up temporary branch "${tempBranch}"...`);
        await deleteBranch(tempBranch, true);
      } catch (cleanupError) {
        log.warn(`Failed to clean up temporary branch "${tempBranch}": ${cleanupError}`);
        log.info(`You can manually delete it with: git branch -D ${tempBranch}`);
      }
    }
  }
};
