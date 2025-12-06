import { existsSync } from "fs";
import { join } from "path";
import { log } from "../utils/logger";
import {
  getUserConfigPath,
  getProjectConfigPath,
  writeConfig,
  getDefaultConfigTemplate,
  getConfigWithSources,
  copySchemaToUserConfig,
  getSchemaPath,
} from "../utils/config";
import Table from "cli-table3";

export type ConfigInitOptions = {
  global?: boolean;
};

export type ConfigShowOptions = {
  // No options currently needed
};

const CONFIG_FILE_NAME = ".codeownersrc.json";

/**
 * Initialize a new config file
 */
export const configInit = async (options: ConfigInitOptions): Promise<void> => {
  try {
    const isGlobal = options.global || false;
    const configPath = isGlobal
      ? getUserConfigPath()
      : join(process.cwd(), CONFIG_FILE_NAME);

    // Check if config already exists
    if (existsSync(configPath)) {
      log.warn(`Config file already exists at: ${configPath}`);
      log.info("Edit the file directly or delete it to create a new one.");
      return;
    }

    // For global config, also copy the schema file for IntelliSense
    if (isGlobal) {
      copySchemaToUserConfig();
      log.info(`Schema file copied to: ${getSchemaPath()}`);
    }

    // Create the config file
    const template = getDefaultConfigTemplate();
    writeConfig(configPath, template);

    log.success(`Config file created at: ${configPath}`);
    log.info("\nExample configuration with template variables:");
    log.info(`{
  "$schema": "~/.config/codeowners-git/schema.json",
  "branchPrefix": "\${username}/\${owner.split('/').pop()}/",
  "messagePrefix": "[\${owner.split('/').pop().toUpperCase()}]",
  "push": true,
  "pr": true
}`);
    log.info("\nAvailable template variables: owner, username, email, date");
    log.info("Templates use JavaScript expressions: \${expression}");

    if (!isGlobal) {
      log.info("\nNote: Run 'cg config init --global' to install the schema file for IntelliSense support.");
    }
  } catch (error) {
    log.error(`Failed to create config file: ${error}`);
    process.exit(1);
  }
};

/**
 * Show the resolved config from all sources
 */
export const configShow = async (_options: ConfigShowOptions): Promise<void> => {
  try {
    const userConfigPath = getUserConfigPath();
    const projectConfigPath = getProjectConfigPath();
    const schemaPath = getSchemaPath();

    log.header("Configuration Sources");
    log.info(`User config: ${existsSync(userConfigPath) ? userConfigPath : "(not found)"}`);
    log.info(`Project config: ${projectConfigPath || "(not found)"}`);
    log.info(`Schema: ${existsSync(schemaPath) ? schemaPath : "(not installed - run 'cg config init --global')"}`);

    log.header("\nResolved Configuration");

    const { config, sources } = getConfigWithSources();

    const table = new Table({
      head: ["Option", "Value", "Source"],
      colWidths: [25, 50, 10],
      wordWrap: true,
    });

    const orderedKeys: (keyof typeof config)[] = [
      "branchPrefix",
      "messagePrefix",
      "defaultOwner",
      "remote",
      "push",
      "verify",
      "include",
      "ignore",
      "upstream",
      "force",
      "keepBranchOnFailure",
      "append",
      "pr",
      "draftPr",
    ];

    for (const key of orderedKeys) {
      const value = config[key];
      const source = sources[key] || "default";
      const displayValue = value === undefined || value === null || value === ""
        ? "(not set)"
        : String(value);

      table.push([key, displayValue, source]);
    }

    console.log(table.toString());

    log.info("\nNote: CLI flags always override config values.");
  } catch (error) {
    log.error(`Failed to show config: ${error}`);
    process.exit(1);
  }
};
