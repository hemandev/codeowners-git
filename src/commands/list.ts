import { getOwner, getOwnerFiles } from "../utils/codeowners";
import { getChangedFiles } from "../utils/git";
import { logFileList, log } from "../utils/logger";
import { matchOwners } from "../utils/matcher";

export type ListOptions = {
  owner?: string;
  include?: string;
};

export const listCodeowners = async (options: ListOptions) => {
  try {
    if (options.owner) {
      // Show filtered files for specific owner (exact match)
      const files = await getOwnerFiles(options.owner);
      logFileList(files, options.owner);
    } else {
      // Show all changed files with filtered owners
      const changedFiles = await getChangedFiles();

      // Get files with their owners and filter using include patterns
      const filesWithOwners = changedFiles.map((file) => ({
        file,
        owners: getOwner(file),
      }));

      let filteredFiles = filesWithOwners;
      if (options.include) {
        const patterns = options.include;
        filteredFiles = filesWithOwners.filter(({ owners }) =>
          matchOwners(owners, patterns)
        );
      }

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
