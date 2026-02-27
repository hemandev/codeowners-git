import { getOwner } from "../utils/codeowners";
import { getChangedFiles, hasUnstagedChanges, getUnstagedFiles } from "../utils/git";
import { log, setSilent, outputJson } from "../utils/logger";
import {
  matchOwners,
  matchOwnersExclusive,
  filterByPathPatterns,
} from "../utils/matcher";

export type ListOptions = {
  include?: string;
  group?: boolean;
  pathPattern?: string;
  exclusive?: boolean;
  coOwned?: boolean;
  json?: boolean;
};

export const listCodeowners = async (options: ListOptions) => {
  try {
    if (options.json) {
      setSilent(true);
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

    // Get changed files and apply path filtering
    let changedFiles = await getChangedFiles();
    changedFiles = filterByPathPatterns(changedFiles, options.pathPattern);

    // Get files with their owners
    const filesWithOwners = changedFiles.map((file) => ({
      file,
      owners: getOwner(file),
    }));

    // Filter files based on options
    let filteredFiles = filesWithOwners;

    // When --exclusive is used without --include, show only files with exactly 1 owner
    if (options.exclusive && !options.include) {
      filteredFiles = filesWithOwners.filter(({ owners }) => owners.length === 1);
    }

    // When --co-owned is used without --include, show only files with 2+ owners
    if (options.coOwned && !options.include) {
      filteredFiles = filesWithOwners.filter(({ owners }) => owners.length > 1);
    }

    // Filter by owner patterns if specified
    if (options.include) {
      const patterns = options.include;
      // Use exclusive matching if --exclusive flag is set
      const matchFn = options.exclusive ? matchOwnersExclusive : matchOwners;
      filteredFiles = filesWithOwners.filter(({ owners }) => {
        // Co-owned filter: only files with multiple owners
        if (options.coOwned && owners.length < 2) {
          return false;
        }
        return matchFn(owners, patterns);
      });
    }

    // JSON output mode
    if (options.json) {
      // Build grouped data if --group is used
      let grouped: Record<string, string[]> | undefined;
      if (options.group) {
        grouped = {};
        for (const { file, owners } of filteredFiles) {
          if (owners.length === 0) {
            grouped["(unowned)"] = grouped["(unowned)"] || [];
            grouped["(unowned)"].push(file);
          } else {
            for (const owner of owners) {
              grouped[owner] = grouped[owner] || [];
              grouped[owner].push(file);
            }
          }
        }
      }

      outputJson({
        command: "list",
        ...(grouped
          ? { grouped }
          : { files: filteredFiles.map(({ file, owners }) => ({ file, owners })) }),
        filters: {
          include: options.include || null,
          pathPattern: options.pathPattern || null,
          exclusive: options.exclusive || false,
          coOwned: options.coOwned || false,
        },
      });
      return;
    }

    if (options.group) {
      // Group files by owner
      const ownerGroups = new Map<string, string[]>();

      for (const { file, owners } of filteredFiles) {
        if (owners.length === 0) {
          // Handle unowned files
          const unownedFiles = ownerGroups.get("(unowned)") || [];
          unownedFiles.push(file);
          ownerGroups.set("(unowned)", unownedFiles);
        } else {
          for (const owner of owners) {
            const files = ownerGroups.get(owner) || [];
            files.push(file);
            ownerGroups.set(owner, files);
          }
        }
      }

      // Sort owners alphabetically, but put (unowned) last
      const sortedOwners = Array.from(ownerGroups.keys()).sort((a, b) => {
        if (a === "(unowned)") return 1;
        if (b === "(unowned)") return -1;
        return a.localeCompare(b);
      });

      // Display a table for each owner
      for (const owner of sortedOwners) {
        const files = ownerGroups.get(owner) || [];
        const tableData = files.map((file, index) => ({
          No: index + 1,
          File: file,
        }));

        log.header(`Files owned by ${log.owner(owner)}:`);
        log.formattedTable(tableData, [
          {
            name: "No",
            width: 8,
          },
          {
            name: "File",
            width: 100,
            formatter: (value: string) => log.smartFile(value),
          },
        ]);
      }
    } else {
      // Default: show all files in a single table with owners column
      const tableData = filteredFiles.map(({ file, owners }, index) => ({
        No: index + 1,
        File: file,
        Owners: owners,
      }));

      log.header(
        options.include
          ? `Changed files matching owners: ${options.include}`
          : "Changed files with code owners:"
      );

      log.formattedTable(tableData, [
        {
          name: "No",
          width: 8,
        },
        {
          name: "File",
          width: 80,
          formatter: (value: string) => log.smartFile(value),
        },
        {
          name: "Owners",
          width: 80,
          formatter: (owners: string[]) =>
            owners.map((owner) => log.owner(owner)).join(", "),
        },
      ]);
    }
  } catch (err) {
    if (options.json) {
      outputJson({ command: "list", error: String(err) });
      process.exit(1);
    }
    log.error(err as string);
    process.exit(1);
  }
};
