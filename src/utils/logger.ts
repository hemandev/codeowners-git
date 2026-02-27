import chalk from "chalk";
import Table from "cli-table3";

type TableColumn = {
  name: string;
  width?: number;
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  formatter?: (value: any) => string;
};

const DEFAULT_COLUMN_WIDTH = 50;
const MAX_LINE_LENGTH = 80;
const MAX_PATH_LENGTH = 60;

// Silent mode — when enabled, all log output and console output is suppressed.
// Used by --json to prevent human-readable output from mixing with JSON.
let _silent = false;

// Original console methods saved for restoration
const _origConsoleLog = console.log;
const _origConsoleWarn = console.warn;
const _origConsoleError = console.error;

const noop = () => {};

/**
 * Enable or disable silent mode.
 * When silent, all log.* methods become no-ops and console.log/warn/error are suppressed.
 */
export const setSilent = (silent: boolean) => {
  _silent = silent;
  if (silent) {
    console.log = noop;
    console.warn = noop;
    console.error = noop;
  } else {
    console.log = _origConsoleLog;
    console.warn = _origConsoleWarn;
    console.error = _origConsoleError;
  }
};

export const isSilent = () => _silent;

/**
 * Write JSON output to stdout, bypassing silent mode.
 * Uses the original console.log so it always outputs even when silent.
 */
export const outputJson = (data: unknown) => {
  _origConsoleLog(JSON.stringify(data, null, 2));
};

export const logFileList = (files: string[], owner?: string) => {
  if (files.length === 0) {
    log.info("No matching files found");
    return;
  }

  if (owner) {
    log.header(`Files owned by ${log.owner(owner)}:`);
  } else {
    log.header("Changed files:");
  }

  for (const file of files) {
    log.file(file);
  }
};

export const log = {
  success: (message: string) => console.log(chalk.green(`✓ ${message}`)),
  error: (message: string) => console.error(chalk.red(`✗ ${message}`)),
  info: (message: string) => console.log(chalk.bold(`ℹ ${message}`)),
  warn: (message: string) => console.warn(chalk.yellow(`⚠ ${message}`)),
  header: (message: string) => console.log(chalk.bold.cyan(`\n${message}`)),
  file: (path: string) => console.log(`- ${chalk.dim(path)}`),
  owner: (name: string) => chalk.magenta(name),

  smartFile: (path: string) => {
    if (path.length <= MAX_PATH_LENGTH) return chalk.dim(path);

    const segments = path.split("/");
    let shortened = "";
    let currentLength = 0;

    // Build path until we reach max length
    for (const segment of segments) {
      if (currentLength + segment.length > MAX_PATH_LENGTH - 3) {
        shortened += "/…";
        break;
      }
      shortened += `/${segment}`;
      currentLength = shortened.length;
    }

    return (
      chalk.dim(shortened.slice(1)) + chalk.reset(path.slice(currentLength))
    );
  },

  formattedTable: <T extends Record<string, unknown>>(
    data: T[],
    columns?: TableColumn[],
  ) => {
    if (data.length === 0) {
      log.info("No data to display");
      return;
    }

    // Auto-detect columns if not specified
    const detectedColumns =
      columns ||
      Object.keys(data[0]).map((name) => ({
        name,
        width: Math.min(
          Math.floor(MAX_LINE_LENGTH / Object.keys(data[0]).length),
          DEFAULT_COLUMN_WIDTH,
        ),
      }));

    // Create table instance
    const table = new Table({
      head: detectedColumns.map((col) => chalk.cyan.bold(col.name)),
      colWidths: detectedColumns.map(
        (col) => col.width || DEFAULT_COLUMN_WIDTH,
      ),
      wordWrap: true,
      wrapOnWordBoundary: true,
      style: {
        head: ["cyan"],
        border: ["gray"],
      },
    });

    // Default formatters
    const columnFormatters = {
      // biome-ignore lint/suspicious/noExplicitAny: <explanation>
      default: (value: any) => value.toString(),
    };

    // Add rows
    for (const item of data) {
      table.push(
        detectedColumns.map((col) => {
          const formatter =
            columns?.find((c) => c.name === col.name)?.formatter ??
            columnFormatters.default;
          return formatter(item[col.name]);
        }),
      );
    }

    console.log(table.toString());
  },
};
