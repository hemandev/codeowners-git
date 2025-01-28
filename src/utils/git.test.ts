import { describe, expect, test } from "bun:test";
import { getChangedFiles } from "./git";

describe("Git Utilities", () => {
  test("getChangedFiles returns array of strings", async () => {
    const files = await getChangedFiles();
    expect(Array.isArray(files)).toBe(true);
  });
});
