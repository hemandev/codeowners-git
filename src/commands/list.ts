import { getOwner } from "../utils/codeowners";
import { getChangedFiles } from "../utils/git";
import { log } from "../utils/logger";
import { matchOwners, filterByPathPatterns } from "../utils/matcher";

export type ListOptions = {
  include?: string;
  group?: boolean;
  pathPattern?: string;
};

export const listCodeowners = async (options: ListOptions) => {
  try {
    // Get changed files and apply path filtering
    let changedFiles = await getChangedFiles();
    changedFiles = filterByPathPatterns(changedFiles, options.pathPattern);

    // Get files with their owners
    const filesWithOwners = changedFiles.map((file) => ({
      file,
      owners: getOwner(file),
    }));

    // Filter by owner patterns if specified
    let filteredFiles = filesWithOwners;
    if (options.include) {
      const patterns = options.include;
      filteredFiles = filesWithOwners.filter(({ owners }) =>
        matchOwners(owners, patterns)
      );
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
    log.error(err as string);
    process.exit(1);
  }
};
