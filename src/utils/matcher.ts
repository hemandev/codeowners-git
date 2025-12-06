import micromatch from "micromatch";

/**
 * Normalize a string for pattern matching.
 * Removes slashes so that `*` effectively matches across `/` boundaries.
 * @example normalizeForMatching("@getoutreach/ce-orca") => "@getoutreachce-orca"
 */
const normalizeForMatching = (value: string): string => {
  return value.replace(/\//g, "");
};

/**
 * Check if a single owner matches a pattern string.
 * Pattern can be comma-separated for multiple patterns.
 *
 * @param owner - Single owner string (e.g., "@getoutreach/ce-orca")
 * @param patterns - Comma-separated patterns (e.g., "*ce-orca,*ce-rme")
 * @returns true if owner matches any pattern
 *
 * @example
 * matchOwnerPattern("@getoutreach/ce-orca", "*ce-orca") // true
 * matchOwnerPattern("@getoutreach/ce-orca", "@getoutreach/ce-orca") // true (exact)
 * matchOwnerPattern("@getoutreach/ce-orca", "*ce-orca,*ce-rme") // true
 */
export const matchOwnerPattern = (owner: string, patterns: string): boolean => {
  if (!patterns || !patterns.trim()) return false;

  const normalizedOwner = normalizeForMatching(owner);
  const normalizedPatterns = patterns
    .split(",")
    .map((p) => normalizeForMatching(p.trim()))
    .filter((p) => p.length > 0);

  return micromatch.isMatch(normalizedOwner, normalizedPatterns);
};

/**
 * Filter a list of owners by pattern, returning matching owners.
 *
 * @param owners - Array of owner strings
 * @param patterns - Comma-separated patterns
 * @returns Array of owners that match at least one pattern
 *
 * @example
 * filterOwnersByPattern(
 *   ["@getoutreach/ce-orca", "@getoutreach/ce-rme", "@getoutreach/fnd-core"],
 *   "*ce-*"
 * ) // Returns ["@getoutreach/ce-orca", "@getoutreach/ce-rme"]
 */
export const filterOwnersByPattern = (
  owners: string[],
  patterns: string
): string[] => {
  if (!patterns || !patterns.trim()) return owners;

  return owners.filter((owner) => matchOwnerPattern(owner, patterns));
};

/**
 * Check if ANY owner in a list matches the given patterns.
 */
export const matchOwners = (owners: string[], patterns: string): boolean => {
  if (!patterns || !patterns.trim()) return false;

  const normalizedOwners = owners.map(normalizeForMatching);
  const normalizedPatterns = patterns
    .split(",")
    .map((p) => normalizeForMatching(p.trim()))
    .filter((p) => p.length > 0);

  return micromatch(normalizedOwners, normalizedPatterns).length > 0;
};

/**
 * Filter files by path patterns using micromatch
 * @param files - Array of file paths to filter
 * @param pattern - Comma-separated micromatch patterns (e.g., "packages/**,src/**")
 * @returns Files that match at least one pattern, or all files if no pattern provided
 */
export const filterByPathPatterns = (
  files: string[],
  pattern?: string
): string[] => {
  // No pattern or empty = return all files
  if (!pattern || !pattern.trim()) return files;

  const patterns = pattern.split(",").map((p) => {
    const trimmed = p.trim();
    // "." means all files
    if (trimmed === ".") return "**";
    // Already has glob characters - use as-is
    if (/[*?[\]{}!]/.test(trimmed)) return trimmed;
    // Trailing slash means directory (e.g., "packages/" -> "packages/**")
    if (trimmed.endsWith("/")) return `${trimmed}**`;
    // No glob chars and no extension in last segment - treat as directory
    const lastSegment = trimmed.split("/").pop() || "";
    if (!lastSegment.includes(".")) return `${trimmed}/**`;
    // Otherwise use as-is (e.g., "README.md")
    return trimmed;
  });

  return micromatch(files, patterns, { dot: true });
};
