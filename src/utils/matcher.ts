import micromatch from "micromatch";

export const matchOwners = (owners: string[], patterns: string): boolean => {
  if (!patterns || !patterns.trim()) return false;

  const normalizedOwners = owners.map((owner) => {
    return owner.replace(/\//g, "");
  });

  const normalizedPatterns = patterns.replace(/\//g, "").split(",");

  const matches = micromatch(normalizedOwners, normalizedPatterns);
  return matches.length > 0;
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
