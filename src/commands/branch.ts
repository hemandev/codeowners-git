import {
  getCurrentBranch,
  createBranch,
  commitChanges,
  checkout,
} from "../utils/git";
import { log } from "../utils/logger";
import { getOwnerFiles } from "../utils/codeowners";

export type BranchOptions = {
  owner?: string;
  branch?: string;
  message?: string;
  verify?: boolean;
};

export const branch = async (options: BranchOptions) => {
  try {
    if (!options.branch || !options.message || !options.owner) {
      throw new Error("Missing required options for branch creation");
    }

    const filesToCommit = await getOwnerFiles(options.owner);
    if (filesToCommit.length <= 0) {
      throw new Error(`No files found for ${options.owner}`);
    }

    log.info("Starting branch creation process...");

    const originalBranch = await getCurrentBranch();
    log.info(`Currently on branch: ${originalBranch}`);

    log.file(`Files to be committed:\n  ${filesToCommit.join("\n  ")}`);

    try {
      log.info(`Creating new branch "${options.branch}"...`);
      await createBranch(options.branch);

      log.info(
        `Committing changes with message: "${
          options.message
        }" ${!options.verify}...`
      );
      await commitChanges(filesToCommit, {
        message: options.message ?? "",
        noVerify: !options.verify,
      });
    } finally {
      log.info(`Checking out original branch "${originalBranch}"...`);
      await checkout(originalBranch);

      log.success(`Branch "${options.branch}" created and changes committed.`);
    }
  } catch (err) {
    log.error(err as string);
    process.exit(1);
  }
};
