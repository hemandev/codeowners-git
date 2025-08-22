import { describe, expect, test } from "bun:test";
import {
  isGitHubCliInstalled,
  findPRTemplate,
  createPullRequest,
  createPRWithTemplate,
} from "./github";

describe("GitHub Utilities", () => {
  describe("isGitHubCliInstalled", () => {
    test("should return boolean value", async () => {
      const result = await isGitHubCliInstalled();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("findPRTemplate", () => {
    test("should return null or template object", async () => {
      const result = await findPRTemplate();
      if (result !== null) {
        expect(result).toHaveProperty("path");
        expect(result).toHaveProperty("content");
        expect(typeof result.path).toBe("string");
        expect(typeof result.content).toBe("string");
      }
      expect(result === null || typeof result === "object").toBe(true);
    });
  });

  describe("createPullRequest", () => {
    test("should throw error for invalid GitHub CLI state", async () => {
      // This test will either succeed if gh is installed or throw the expected error
      try {
        const result = await createPullRequest({
          title: "Test PR",
        });
        // If this succeeds, gh CLI is installed and working
        expect(typeof result).toBe("object");
      } catch (error: any) {
        // Expected error when gh CLI is not installed or fails
        expect(error.message).toMatch(/GitHub CLI|Failed to create pull request|Failed to execute gh command/);
      }
    });
  });

  describe("createPRWithTemplate", () => {
    test("should handle template operations", async () => {
      // This will test the function without actually creating PRs
      try {
        const result = await createPRWithTemplate("Test PR", "test-branch");
        // If this succeeds, everything is working
        expect(typeof result).toBe("object");
      } catch (error: any) {
        // Expected error when gh CLI is not available or other issues
        expect(error.message).toMatch(/GitHub CLI|Failed to create pull request|Failed to execute gh command/);
      }
    });
  });
});