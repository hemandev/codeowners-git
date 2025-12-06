import { describe, expect, test } from "bun:test";
import { renderTemplate, hasTemplateExpressions, type TemplateContext } from "./template";

const mockContext: TemplateContext = {
  owner: "@getoutreach/ce-orca",
  username: "hemandev",
  email: "hemandev@example.com",
  date: "2025-01-15",
};

describe("renderTemplate", () => {
  test("should return original string when no template expressions", () => {
    expect(renderTemplate("simple string", mockContext)).toBe("simple string");
    expect(renderTemplate("no/templates/here", mockContext)).toBe("no/templates/here");
    expect(renderTemplate("", mockContext)).toBe("");
  });

  test("should replace simple variable expressions", () => {
    expect(renderTemplate("${owner}", mockContext)).toBe("@getoutreach/ce-orca");
    expect(renderTemplate("${username}", mockContext)).toBe("hemandev");
    expect(renderTemplate("${email}", mockContext)).toBe("hemandev@example.com");
    expect(renderTemplate("${date}", mockContext)).toBe("2025-01-15");
  });

  test("should handle string methods on owner", () => {
    // Extract team name from owner
    expect(renderTemplate("${owner.split('/').pop()}", mockContext)).toBe("ce-orca");
    // Remove @ symbol
    expect(renderTemplate("${owner.replace('@', '')}", mockContext)).toBe("getoutreach/ce-orca");
    // Get org name
    expect(renderTemplate("${owner.split('/')[0].replace('@', '')}", mockContext)).toBe("getoutreach");
    // Uppercase
    expect(renderTemplate("${owner.toUpperCase()}", mockContext)).toBe("@GETOUTREACH/CE-ORCA");
  });

  test("should handle complex transformations", () => {
    // Transform @getoutreach/ce-orca to "orca" (remove prefix)
    expect(
      renderTemplate("${owner.split('/').pop().replace('ce-', '')}", mockContext)
    ).toBe("orca");

    // Transform to uppercase team name: [ORCA]
    expect(
      renderTemplate("[${owner.split('/').pop().replace('ce-', '').toUpperCase()}]", mockContext)
    ).toBe("[ORCA]");
  });

  test("should handle multiple expressions in one template", () => {
    expect(
      renderTemplate("${username}/${owner.split('/').pop()}/", mockContext)
    ).toBe("hemandev/ce-orca/");

    expect(
      renderTemplate("[${owner}] by ${username} on ${date}", mockContext)
    ).toBe("[@getoutreach/ce-orca] by hemandev on 2025-01-15");
  });

  test("should handle prefix/suffix patterns", () => {
    // Branch prefix pattern
    expect(
      renderTemplate("${username}/${owner.split('/').pop().replace('ce-', '')}/", mockContext)
    ).toBe("hemandev/orca/");

    // Message prefix pattern
    expect(
      renderTemplate("[${owner.split('/').pop().replace('ce-', '').toUpperCase()}]", mockContext)
    ).toBe("[ORCA]");
  });

  test("should return original template on invalid expressions", () => {
    // Invalid JavaScript
    expect(renderTemplate("${invalid..syntax}", mockContext)).toBe("${invalid..syntax}");
    // Undefined variable access should not throw
    const result = renderTemplate("${nonexistent}", mockContext);
    // Returns empty string or undefined (not the template)
    expect(result).not.toBe("${nonexistent}");
  });

  test("should handle empty context values", () => {
    const emptyContext: TemplateContext = {
      owner: "",
      username: "",
      email: "",
      date: "",
    };
    expect(renderTemplate("${owner}", emptyContext)).toBe("");
    expect(renderTemplate("prefix-${owner}-suffix", emptyContext)).toBe("prefix--suffix");
  });

  test("should handle special characters in owner names", () => {
    const contextWithSpecialChars: TemplateContext = {
      ...mockContext,
      owner: "@org-name/team_with-dashes",
    };
    expect(
      renderTemplate("${owner.split('/').pop()}", contextWithSpecialChars)
    ).toBe("team_with-dashes");
  });
});

describe("hasTemplateExpressions", () => {
  test("should return true for strings with template expressions", () => {
    expect(hasTemplateExpressions("${owner}")).toBe(true);
    expect(hasTemplateExpressions("prefix-${owner}-suffix")).toBe(true);
    expect(hasTemplateExpressions("${a}${b}")).toBe(true);
  });

  test("should return false for strings without template expressions", () => {
    expect(hasTemplateExpressions("simple string")).toBe(false);
    expect(hasTemplateExpressions("no templates")).toBe(false);
    expect(hasTemplateExpressions("$owner")).toBe(false); // Missing braces
    expect(hasTemplateExpressions("{owner}")).toBe(false); // Missing dollar sign
  });

  test("should return false for empty or undefined values", () => {
    expect(hasTemplateExpressions("")).toBe(false);
    expect(hasTemplateExpressions(undefined)).toBe(false);
  });
});
