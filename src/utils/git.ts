import simpleGit, { type SimpleGit } from "simple-git";
import { log } from "../utils/logger";
import fs from "fs/promises";
import path from "path";

const git: SimpleGit = simpleGit();

export type CommitOptions = {
  message: string;
  noVerify?: boolean;
};

export type PushOptions = {
  remote?: string;
  upstream?: string;
  force?: boolean;
  noVerify?: boolean;
};

// Save the current state for recovery
export const saveGitState = async (): Promise<{
  branch: string;
  uncommittedChanges: string[];
  stagedChanges: string[];
}> => {
  const currentBranch = await getCurrentBranch();
  const status = await git.status();

  return {
    branch: currentBranch,
    uncommittedChanges: status.files
      .filter((file) => file.working_dir !== " ")
      .map((file) => file.path),
    stagedChanges: status.files
      .filter((file) => file.index !== " ")
      .map((file) => file.path),
  };
};

// Stash any changes to preserve them
export const stashChanges = async (
  message = "Auto-stash before operation"
): Promise<string | null> => {
  try {
    const status = await git.status();
    if (status.files.length === 0) {
      return null; // No changes to stash
    }

    log.info(`Stashing current changes: ${message}`);
    const result = await git.stash(["push", "-m", message]);
    if (result.includes("No local changes to save")) {
      return null;
    }

    // Extract stash hash from message like "Saved working directory and index state..."
    const stashId = result.includes("Saved working directory")
      ? result
          .split(":")[0]
          .replace("Saved working directory and index state ", "")
          .trim()
      : "stash@{0}";

    log.info(`Changes stashed at: ${stashId}`);
    return stashId;
  } catch (error) {
    log.error(`Failed to stash changes: ${error}`);
    return null;
  }
};

// Apply stashed changes
export const applyStash = async (stashId: string | null): Promise<boolean> => {
  if (!stashId) return true;

  try {
    log.info(`Applying stashed changes: ${stashId}`);
    await git.stash(["apply", stashId]);
    await git.stash(["drop", stashId]);
    return true;
  } catch (error) {
    log.error(`Failed to apply stashed changes: ${error}`);
    log.info(
      "Your changes are preserved in the stash. Use 'git stash list' to see them."
    );
    return false;
  }
};

export const getChangedFiles = async (): Promise<string[]> => {
  const status = await git.status();
  return status.files.map((file) => file.path);
};

export const branchExists = async (branchName: string): Promise<boolean> => {
  try {
    const branches = await git.branch();
    return branches.all.includes(branchName);
  } catch (error) {
    log.error(`Failed to check if branch exists: ${error}`);
    return false;
  }
};

export const createBranch = async (branchName: string): Promise<void> => {
  log.info(`Switching to a new local branch: "${branchName}"`);
  try {
    await git.checkoutLocalBranch(branchName);
    log.info(`Now on branch: "${branchName}"`);
  } catch (error) {
    throw new Error(`Failed to create branch "${branchName}": ${error}`);
  }
};

export const deleteBranch = async (
  branchName: string,
  force = false
): Promise<boolean> => {
  try {
    if (await branchExists(branchName)) {
      log.info(`Deleting branch: "${branchName}"${force ? " (forced)" : ""}`);
      await git.branch([force ? "-D" : "-d", branchName]);
      log.info(`Branch "${branchName}" deleted successfully`);
      return true;
    }
    return false;
  } catch (error) {
    log.error(`Failed to delete branch "${branchName}": ${error}`);
    return false;
  }
};

export const checkout = async (name: string): Promise<void> => {
  log.info(`Switching to branch: "${name}"`);
  try {
    await git.checkout(name);
  } catch (error) {
    throw new Error(`Failed to checkout branch "${name}": ${error}`);
  }
};

export const restoreFiles = async (files: string[]): Promise<void> => {
  if (!files || files.length === 0) return;

  try {
    log.info(`Restoring ${files.length} files to their original state`);
    await git.checkout(["--", ...files]);
  } catch (error) {
    log.error(`Failed to restore files: ${error}`);
    throw error;
  }
};

export const commitChanges = async (
  files: string[],
  { message, noVerify = false }: CommitOptions
): Promise<void> => {
  try {
    log.info("Adding files to commit...");
    await git.add(files);

    log.info(`Running commit with message: "${message}"`);
    await git.commit(message, [], {
      ...(noVerify ? { "--no-verify": null } : {}),
    });

    log.info("Commit finished successfully.");
  } catch (error) {
    log.error(`Failed to commit changes: ${error}`);
    throw new Error(`Commit failed: ${error}`);
  }
};

export const getCurrentBranch = async (): Promise<string> => {
  try {
    return await git.revparse(["--abbrev-ref", "HEAD"]);
  } catch (error) {
    throw new Error(`Failed to get current branch: ${error}`);
  }
};

export const pushBranch = async (
  branchName: string,
  {
    remote = "origin",
    upstream,
    force = false,
    noVerify = false,
  }: PushOptions = {}
): Promise<void> => {
  const targetUpstream = upstream || branchName;

  log.info(`Pushing branch "${branchName}" to ${remote}/${targetUpstream}...`);

  const pushOptions: string[] = [];
  if (force) {
    pushOptions.push("--force");
  }
  if (noVerify) {
    pushOptions.push("--no-verify");
  }

  try {
    await git.push(remote, `${branchName}:${targetUpstream}`, pushOptions);
    log.success(`Successfully pushed to ${remote}/${targetUpstream}`);
  } catch (error) {
    log.error(`Failed to push to remote: ${error}`);
    throw new Error(`Push failed: ${error}`);
  }
};
