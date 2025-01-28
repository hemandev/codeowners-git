import { describe, expect, test } from "bun:test";
import { matchOwners } from "./matcher";

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
