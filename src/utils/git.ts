import simpleGit, { type SimpleGit } from "simple-git";
import { log } from "../utils/logger";

const git: SimpleGit = simpleGit();

export const getChangedFiles = async (): Promise<string[]> => {
  const status = await git.status();
  return status.files.map((file) => file.path);
};

export const createBranch = async (branchName: string): Promise<void> => {
  log.info(`Switching to a new local branch: "${branchName}"`);
  await git.checkoutLocalBranch(branchName);
  log.info(`Now on branch: "${branchName}"`);
};

export const checkout = async (name: string): Promise<void> => {
  log.info(`Switching to branch: "${name}"`);
  await git.checkout(name);
};

export const commitChanges = async (
  files: string[],
  message: string,
): Promise<void> => {
  log.info("Adding files to commit...");
  await git.add(files);

  log.info(`Running commit with message: "${message}"`);
  await git.commit(message);

  log.info("Commit finished successfully.");
};

export const getCurrentBranch = async (): Promise<string> => {
  return await git.revparse(["--abbrev-ref", "HEAD"]);
};
