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
  .action(branch);

program.parse(process.argv);
