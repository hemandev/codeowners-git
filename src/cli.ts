#!/usr/bin/env node
import { Command } from "commander";
import { listCodeowners } from "./commands/list";
import { branch } from "./commands/branch";
import { multiBranch } from "./commands/multi-branch";
import { recover } from "./commands/recover";
import { getVersion } from "./commands/version";
import { setupSignalHandlers } from "./utils/signals";

// Setup signal handlers for graceful shutdown
setupSignalHandlers();

const program = new Command();

program
  .name("codeowners-git (cg)")
  .description("CLI tool for grouping and managing staged files by CODEOWNERS")
  .version(getVersion());

program
  .command("list")
  .description("Lists all git changed files by CODEOWNER")
  .option("-o, --owner <owner>", "Filter by specific code owner")
  .option("-i, --include <patterns>", "Filter by owner patterns")
  .action(listCodeowners);

program
  .command("branch")
  .description("Create new branch with codeowner changes")
  .requiredOption("-o, --owner <owner>", "Code owner name")
  .requiredOption("-b, --branch <branch>", "Branch name")
  .requiredOption("-m, --message <message>", "Commit message")
  .option("-n, --no-verify", "Skip lint-staged or any other ci checks")
  .option("-p, --push", "Push branch to remote after commit")
  .option("-r, --remote <remote>", "Remote name to push to", "origin")
  .option(
    "-u, --upstream <upstream>",
    "Upstream branch name (defaults to local branch name)"
  )
  .option("-f, --force", "Force push to remote")
  .option(
    "-k, --keep-branch-on-failure",
    "Keep the created branch even if operation fails"
  )
  .option(
    "--append",
    "Add commits to existing branch instead of creating a new one"
  )
  .option("--pr", "Create a pull request after pushing (requires --push)")
  .option(
    "--draft-pr",
    "Create a draft pull request after pushing (requires --push)"
  )
  .action(branch);

program
  .command("multi-branch")
  .description("Create branches for all codeowners")
  .requiredOption(
    "-b, --branch <branch>",
    "Base branch name (will be suffixed with codeowner name)"
  )
  .requiredOption(
    "-m, --message <message>",
    "Base commit message (will be suffixed with codeowner name)"
  )
  .option("-n, --no-verify", "Skip lint-staged or any other ci checks")
  .option("-p, --push", "Push branches to remote after commit")
  .option("-r, --remote <remote>", "Remote name to push to", "origin")
  .option(
    "-u, --upstream <upstream>",
    "Upstream branch name pattern (defaults to local branch name)"
  )
  .option("-f, --force", "Force push to remote")
  .option(
    "-k, --keep-branch-on-failure",
    "Keep created branches even if operation fails"
  )
  .option(
    "-d, --default-owner <defaultOwner>",
    "Default owner to use when no codeowners are found for changed files"
  )
  .option(
    "--ignore <patterns>",
    "Comma-separated patterns to exclude codeowners (e.g., 'team-a,team-b')"
  )
  .option(
    "--include <patterns>",
    "Comma-separated patterns to include codeowners (e.g., 'team-*,@org/*')"
  )
  .option(
    "--append",
    "Add commits to existing branches instead of creating new ones"
  )
  .option("--pr", "Create pull requests after pushing (requires --push)")
  .option(
    "--draft-pr",
    "Create draft pull requests after pushing (requires --push)"
  )
  .action(multiBranch);

program
  .command("recover")
  .description("Recover from failed or incomplete operations")
  .option("--id <operationId>", "Specific operation ID to recover")
  .option("--keep-branches", "Keep created branches instead of deleting them")
  .option("--list", "List all incomplete operations")
  .option("--auto", "Automatically recover most recent operation without prompts")
  .action(recover);

program.parse(process.argv);
