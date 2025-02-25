#!/usr/bin/env node
import { Command } from "commander";
import { listCodeowners } from "./commands/list";
import { branch } from "./commands/branch";

const program = new Command();

program
  .name("codeowners")
  .description("CLI tool for grouping and managing staged files by CODEOWNERS");

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
  .action(branch);

program.parse(process.argv);
