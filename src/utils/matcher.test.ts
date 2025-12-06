import { describe, expect, test } from "bun:test";
import { matchOwners, filterByPathPatterns } from "./matcher";

describe("matchOwners", () => {
  const owners = [
    "@getoutreach/fnd-ade",
    "@getoutreach/ce-orca",
    "@getoutreach/ce-ue",
    "@getoutreach/fnd-core",
    "@otherorg/team-alpha",
  ];

  test("should match exact owner", () => {
    expect(matchOwners(owners, "@getoutreach/fnd-ade")).toBe(true);
    expect(matchOwners(owners, "@otherorg/team-alpha")).toBe(true);
    expect(matchOwners(owners, "@nonexistent/team")).toBe(false);
  });

  test("should match partial owner names", () => {
    expect(matchOwners(owners, "*fnd-ade")).toBe(true);
    expect(matchOwners(["@getoutreach/ce-ade"], "*ce-*")).toBe(true);
    expect(matchOwners(owners, "alpha")).toBe(false);
    expect(matchOwners(owners, "nonexistent")).toBe(false);
  });

  test("should match wildcard patterns", () => {
    expect(matchOwners(owners, "*-ade")).toBe(true);
    expect(matchOwners(owners, "@getoutreach/*")).toBe(true);
    expect(matchOwners(owners, "@otherorg/*")).toBe(true);
    expect(matchOwners(owners, "*ce-*")).toBe(true);
    expect(matchOwners(owners, "*core")).toBe(true);
    expect(matchOwners(owners, "@nonexistent/*")).toBe(false);
  });

  test("should match multiple patterns", () => {
    expect(
      matchOwners(owners, "@getoutreach/fnd-ade,@getoutreach/ce-orca"),
    ).toBe(true);
    expect(matchOwners(owners, "*fnd-ade,*ce-orca")).toBe(true);
    expect(matchOwners(owners, "*fnd-*,*ce-*")).toBe(true);
    expect(matchOwners(owners, "nonexistent,other-nonexistent")).toBe(false);
  });

  test("should handle empty patterns", () => {
    expect(matchOwners(owners, "")).toBe(false);
    expect(matchOwners(owners, "   ")).toBe(false);
  });

  test("should handle case sensitivity", () => {
    expect(matchOwners(owners, "@GETOUTREACH/FND-ADE")).toBe(false);
    expect(matchOwners(owners, "FND-ADE")).toBe(false);
  });

  test("should match patterns with special characters", () => {
    expect(matchOwners(owners, "@getoutreach/fnd-ade")).toBe(true);
    expect(matchOwners(owners, "@getoutreach/*-ade")).toBe(true);
    expect(matchOwners(owners, "@getoutreach/fnd-core")).toBe(true);
  });

  test("should not match invalid patterns", () => {
    expect(matchOwners(owners, "@invalid/team")).toBe(false);
    expect(matchOwners(owners, "invalid-*")).toBe(false);
    expect(matchOwners(owners, "*invalid")).toBe(false);
  });
});

describe("filterByPathPatterns", () => {
  const files = [
    "packages/foo/index.ts",
    "packages/bar/test.spec.tsx",
    "apps/web/page.tsx",
    "apps/api/server.ts",
    "README.md",
    ".github/workflows/ci.yml",
  ];

  test("returns all files when no pattern provided", () => {
    expect(filterByPathPatterns(files, undefined)).toEqual(files);
    expect(filterByPathPatterns(files, "")).toEqual(files);
    expect(filterByPathPatterns(files, "   ")).toEqual(files);
  });

  test("filters files by single pattern", () => {
    const result = filterByPathPatterns(files, "packages/**");
    expect(result).toEqual([
      "packages/foo/index.ts",
      "packages/bar/test.spec.tsx",
    ]);
  });

  test("filters files by comma-separated patterns", () => {
    const result = filterByPathPatterns(files, "packages/**,apps/web/**");
    expect(result).toEqual([
      "packages/foo/index.ts",
      "packages/bar/test.spec.tsx",
      "apps/web/page.tsx",
    ]);
  });

  test("filters by file extension patterns", () => {
    const result = filterByPathPatterns(files, "**/*.spec.tsx");
    expect(result).toEqual(["packages/bar/test.spec.tsx"]);
  });

  test("matches dotfiles when pattern allows", () => {
    const result = filterByPathPatterns(files, ".github/**");
    expect(result).toEqual([".github/workflows/ci.yml"]);
  });

  test("returns empty array when no files match", () => {
    const result = filterByPathPatterns(files, "nonexistent/**");
    expect(result).toEqual([]);
  });

  test("handles patterns with spaces after comma", () => {
    const result = filterByPathPatterns(files, "packages/**, apps/web/**");
    expect(result).toEqual([
      "packages/foo/index.ts",
      "packages/bar/test.spec.tsx",
      "apps/web/page.tsx",
    ]);
  });

  test("matches root level files", () => {
    const result = filterByPathPatterns(files, "*.md");
    expect(result).toEqual(["README.md"]);
  });

  test("handles dot pattern for current directory (matches all files)", () => {
    const result = filterByPathPatterns(files, ".");
    expect(result).toEqual(files);
  });

  test("handles trailing slash as recursive pattern", () => {
    const result = filterByPathPatterns(files, "packages/");
    expect(result).toEqual([
      "packages/foo/index.ts",
      "packages/bar/test.spec.tsx",
    ]);
  });

  test("handles trailing slash with comma-separated patterns", () => {
    const result = filterByPathPatterns(files, "packages/,apps/");
    expect(result).toEqual([
      "packages/foo/index.ts",
      "packages/bar/test.spec.tsx",
      "apps/web/page.tsx",
      "apps/api/server.ts",
    ]);
  });

  test("handles directory without trailing slash (same as with slash)", () => {
    const result = filterByPathPatterns(files, "packages");
    expect(result).toEqual([
      "packages/foo/index.ts",
      "packages/bar/test.spec.tsx",
    ]);
  });

  test("handles nested directory without trailing slash", () => {
    const result = filterByPathPatterns(files, "apps/web");
    expect(result).toEqual(["apps/web/page.tsx"]);
  });

  test("handles comma-separated directories without slashes", () => {
    const result = filterByPathPatterns(files, "packages,apps");
    expect(result).toEqual([
      "packages/foo/index.ts",
      "packages/bar/test.spec.tsx",
      "apps/web/page.tsx",
      "apps/api/server.ts",
    ]);
  });

  test("preserves glob patterns as-is", () => {
    const result = filterByPathPatterns(files, "**/*.tsx");
    expect(result).toEqual([
      "packages/bar/test.spec.tsx",
      "apps/web/page.tsx",
    ]);
  });

  test("preserves file patterns with extensions", () => {
    const result = filterByPathPatterns(files, "README.md");
    expect(result).toEqual(["README.md"]);
  });
});
