import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { log } from "./logger";

export type Config = {
  branchPrefix?: string;
  messagePrefix?: string;
  defaultOwner?: string;
  remote?: string;
  push?: boolean;
  verify?: boolean;
  include?: string;
  ignore?: string;
  upstream?: string;
  force?: boolean;
  keepBranchOnFailure?: boolean;
  append?: boolean;
  pr?: boolean;
  draftPr?: boolean;
};

const CONFIG_FILE_NAME = ".codeownersrc.json";
const USER_CONFIG_DIR = ".config/codeowners-git";
const USER_CONFIG_FILE = "config.json";
const SCHEMA_FILE_NAME = "schema.json";

/**
 * Get the path to the user-level schema file
 * ~/.config/codeowners-git/schema.json
 */
export const getSchemaPath = (): string => {
  return join(homedir(), USER_CONFIG_DIR, SCHEMA_FILE_NAME);
};

/**
 * Get the path to the bundled schema file (in the package)
 */
export const getBundledSchemaPath = (): string => {
  // When running from source or installed as a package
  // The schema.json is at the package root
  return join(__dirname, "..", "..", SCHEMA_FILE_NAME);
};

/**
 * Copy the bundled schema.json to the user's config directory
 * Creates the directory if it doesn't exist
 */
export const copySchemaToUserConfig = (): void => {
  const userSchemaPath = getSchemaPath();
  const bundledSchemaPath = getBundledSchemaPath();
  const userConfigDir = dirname(userSchemaPath);

  // Create config directory if it doesn't exist
  if (!existsSync(userConfigDir)) {
    mkdirSync(userConfigDir, { recursive: true });
  }

  // Only copy if bundled schema exists
  if (existsSync(bundledSchemaPath)) {
    copyFileSync(bundledSchemaPath, userSchemaPath);
  } else {
    log.warn(`Bundled schema not found at ${bundledSchemaPath}`);
  }
};

/**
 * Get the path to the user-level config file
 * ~/.config/codeowners-git/config.json
 */
export const getUserConfigPath = (): string => {
  return join(homedir(), USER_CONFIG_DIR, USER_CONFIG_FILE);
};

/**
 * Get the path to the project-level config file if it exists
 * Searches for .codeownersrc.json in the current directory
 */
export const getProjectConfigPath = (): string | null => {
  const configPath = join(process.cwd(), CONFIG_FILE_NAME);
  return existsSync(configPath) ? configPath : null;
};

/**
 * Read and parse a JSON config file
 */
const readConfigFile = (filePath: string): Config => {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content);
    // Remove $schema key if present (it's just for IntelliSense)
    const { $schema, ...config } = parsed;
    return config as Config;
  } catch (error) {
    log.warn(`Failed to read config file ${filePath}: ${error}`);
    return {};
  }
};

/**
 * Load and merge config from all sources
 * Precedence: built-in defaults < user config < project config
 */
export const loadConfig = (): Config => {
  const defaults: Config = {
    remote: "origin",
    push: false,
    verify: true,
    force: false,
    keepBranchOnFailure: false,
    append: false,
    pr: false,
    draftPr: false,
  };

  let config: Config = { ...defaults };

  // Load user-level config
  const userConfigPath = getUserConfigPath();
  if (existsSync(userConfigPath)) {
    const userConfig = readConfigFile(userConfigPath);
    config = { ...config, ...userConfig };
  }

  // Load project-level config (overrides user config)
  const projectConfigPath = getProjectConfigPath();
  if (projectConfigPath) {
    const projectConfig = readConfigFile(projectConfigPath);
    config = { ...config, ...projectConfig };
  }

  return config;
};

/**
 * Merge loaded config with CLI options
 * CLI options always take precedence over config
 * Only applies config values if CLI option is undefined
 */
export const mergeWithCliOptions = <T extends Record<string, unknown>>(
  config: Config,
  cliOptions: T
): T => {
  const merged = { ...cliOptions };

  // Map config keys to CLI option keys
  const configToCliMap: Record<keyof Config, string> = {
    branchPrefix: "branchPrefix",
    messagePrefix: "messagePrefix",
    defaultOwner: "defaultOwner",
    remote: "remote",
    push: "push",
    verify: "verify",
    include: "include",
    ignore: "ignore",
    upstream: "upstream",
    force: "force",
    keepBranchOnFailure: "keepBranchOnFailure",
    append: "append",
    pr: "pr",
    draftPr: "draftPr",
  };

  for (const [configKey, cliKey] of Object.entries(configToCliMap)) {
    const configValue = config[configKey as keyof Config];
    // Only apply config if CLI option is undefined and config value exists
    if (merged[cliKey] === undefined && configValue !== undefined && configValue !== null) {
      (merged as Record<string, unknown>)[cliKey] = configValue;
    }
  }

  return merged;
};

/**
 * Write config to a file
 */
export const writeConfig = (filePath: string, config: Config): void => {
  const dir = dirname(filePath);

  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  // Add schema reference for IntelliSense
  // Use ~ shorthand for home directory (works in VSCode and most editors)
  const configWithSchema = {
    $schema: "~/.config/codeowners-git/schema.json",
    ...config,
  };

  writeFileSync(filePath, JSON.stringify(configWithSchema, null, 2) + "\n", "utf-8");
};

/**
 * Get the default config template for initialization
 */
export const getDefaultConfigTemplate = (): Config => {
  return {
    branchPrefix: "",
    messagePrefix: "",
    defaultOwner: "",
    remote: "origin",
    push: false,
    verify: true,
    include: undefined,
    ignore: undefined,
    upstream: undefined,
    force: false,
    keepBranchOnFailure: false,
    append: false,
    pr: false,
    draftPr: false,
  };
};

/**
 * Display the resolved config with source information
 */
export const getConfigWithSources = (): { config: Config; sources: Record<string, string> } => {
  const defaults: Config = {
    remote: "origin",
    push: false,
    verify: true,
    force: false,
    keepBranchOnFailure: false,
    append: false,
    pr: false,
    draftPr: false,
  };

  const sources: Record<string, string> = {};
  let config: Config = {};

  // Track defaults
  for (const key of Object.keys(defaults)) {
    sources[key] = "default";
    config[key as keyof Config] = defaults[key as keyof Config] as never;
  }

  // Load user-level config
  const userConfigPath = getUserConfigPath();
  if (existsSync(userConfigPath)) {
    const userConfig = readConfigFile(userConfigPath);
    for (const [key, value] of Object.entries(userConfig)) {
      if (value !== undefined && value !== null) {
        config[key as keyof Config] = value as never;
        sources[key] = "user";
      }
    }
  }

  // Load project-level config
  const projectConfigPath = getProjectConfigPath();
  if (projectConfigPath) {
    const projectConfig = readConfigFile(projectConfigPath);
    for (const [key, value] of Object.entries(projectConfig)) {
      if (value !== undefined && value !== null) {
        config[key as keyof Config] = value as never;
        sources[key] = "project";
      }
    }
  }

  return { config, sources };
};
