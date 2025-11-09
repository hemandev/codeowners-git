import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, unlinkSync } from "fs";
import { join } from "path";
import { randomUUID, createHash } from "crypto";
import { homedir } from "os";
import { log } from "./logger";

export type OperationState = "initializing" | "creating-branch" | "committing" | "pushing" | "creating-pr" | "complete" | "failed";

export type BranchState = {
  name: string;
  owner: string;
  created: boolean;
  committed: boolean;
  pushed: boolean;
  prCreated: boolean;
  files: string[];
  error?: string;
};

export type OperationStateData = {
  id: string;
  timestamp: string;
  operation: "branch" | "multi-branch";
  originalBranch: string;
  currentState: OperationState;
  branches: BranchState[];
  options: {
    verify?: boolean;
    push?: boolean;
    remote?: string;
    force?: boolean;
    keepBranchOnFailure?: boolean;
    pr?: boolean;
    draftPr?: boolean;
  };
};

/**
 * Get a unique identifier for the current project based on its path
 */
const getProjectHash = (): string => {
  const projectPath = process.cwd();
  return createHash("md5").update(projectPath).digest("hex").substring(0, 12);
};

/**
 * Get the path to the state directory
 * Stores state in ~/.codeowners-git/state/<project-hash>/
 */
export const getStateDir = (): string => {
  const projectHash = getProjectHash();
  return join(homedir(), ".codeowners-git", "state", projectHash);
};

/**
 * Ensure the state directory exists
 */
export const ensureStateDir = (): void => {
  const stateDir = getStateDir();

  if (!existsSync(stateDir)) {
    mkdirSync(stateDir, { recursive: true });
  }
};

/**
 * Generate a unique operation ID
 */
export const generateOperationId = (): string => {
  return randomUUID();
};

/**
 * Get the file path for a state file
 */
export const getStateFilePath = (operationId: string): string => {
  return join(getStateDir(), `${operationId}.json`);
};

/**
 * Create a new operation state
 */
export const createOperationState = (
  operation: "branch" | "multi-branch",
  originalBranch: string,
  options: OperationStateData["options"]
): OperationStateData => {
  const operationId = generateOperationId();

  const state: OperationStateData = {
    id: operationId,
    timestamp: new Date().toISOString(),
    operation,
    originalBranch,
    currentState: "initializing",
    branches: [],
    options,
  };

  ensureStateDir();
  saveOperationState(state);

  return state;
};

/**
 * Save operation state to disk
 */
export const saveOperationState = (state: OperationStateData): void => {
  const filePath = getStateFilePath(state.id);
  writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
};

/**
 * Load operation state from disk
 */
export const loadOperationState = (operationId: string): OperationStateData | null => {
  const filePath = getStateFilePath(operationId);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as OperationStateData;
  } catch (error) {
    log.error(`Failed to load state file ${operationId}: ${error}`);
    return null;
  }
};

/**
 * Delete operation state file
 */
export const deleteOperationState = (operationId: string): void => {
  const filePath = getStateFilePath(operationId);

  if (existsSync(filePath)) {
    unlinkSync(filePath);
  }
};

/**
 * List all operation states
 */
export const listOperationStates = (): OperationStateData[] => {
  const stateDir = getStateDir();

  if (!existsSync(stateDir)) {
    return [];
  }

  const files = readdirSync(stateDir).filter(f => f.endsWith(".json"));
  const states: OperationStateData[] = [];

  for (const file of files) {
    const operationId = file.replace(".json", "");
    const state = loadOperationState(operationId);
    if (state) {
      states.push(state);
    }
  }

  // Sort by timestamp (newest first)
  return states.sort((a, b) =>
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
};

/**
 * Update operation state
 */
export const updateOperationState = (
  operationId: string,
  updates: Partial<Omit<OperationStateData, "id" | "timestamp">>
): void => {
  const state = loadOperationState(operationId);

  if (!state) {
    throw new Error(`Operation state ${operationId} not found`);
  }

  Object.assign(state, updates);
  saveOperationState(state);
};

/**
 * Add or update a branch in the operation state
 */
export const updateBranchState = (
  operationId: string,
  branchName: string,
  updates: Partial<BranchState>
): void => {
  const state = loadOperationState(operationId);

  if (!state) {
    throw new Error(`Operation state ${operationId} not found`);
  }

  const existingBranch = state.branches.find(b => b.name === branchName);

  if (existingBranch) {
    Object.assign(existingBranch, updates);
  } else {
    state.branches.push({
      name: branchName,
      owner: updates.owner || "",
      created: updates.created || false,
      committed: updates.committed || false,
      pushed: updates.pushed || false,
      prCreated: updates.prCreated || false,
      files: updates.files || [],
      error: updates.error,
    });
  }

  saveOperationState(state);
};

/**
 * Mark operation as complete and optionally delete state file
 */
export const completeOperation = (operationId: string, deleteState = true): void => {
  updateOperationState(operationId, { currentState: "complete" });

  if (deleteState) {
    deleteOperationState(operationId);
  }
};

/**
 * Mark operation as failed
 */
export const failOperation = (operationId: string, error?: string): void => {
  const state = loadOperationState(operationId);

  if (!state) {
    return;
  }

  state.currentState = "failed";

  if (error && state.branches.length > 0) {
    // Add error to the last branch being processed
    const lastBranch = state.branches[state.branches.length - 1];
    lastBranch.error = error;
  }

  saveOperationState(state);
};

/**
 * Check if there are any incomplete operations
 */
export const hasIncompleteOperations = (): boolean => {
  const states = listOperationStates();
  return states.some(s => s.currentState !== "complete" && s.currentState !== "failed");
};

/**
 * Get incomplete operations
 */
export const getIncompleteOperations = (): OperationStateData[] => {
  const states = listOperationStates();
  return states.filter(s => s.currentState !== "complete");
};
