import { describe, it, expect } from "vitest";
import { remember, recall, listMemories } from "../src/memory.js";

describe("memory", () => {
  const testKey = `test-key-${Date.now()}`;

  it("stores and recalls a memory", async () => {
    const result = remember(testKey, "This is a test memory", ["test", "vitest"]);
    expect(result).toContain("Remembered");

    const recalled = await recall(testKey);
    expect(recalled).toContain("test-key");
    expect(recalled).toContain("This is a test memory");
    expect(recalled).toContain("vitest");
  });

  it("lists memories by tag", async () => {
    remember(`list-test-${Date.now()}`, "content", ["list-tag"]);
    const list = await listMemories("list-tag");
    expect(list).toContain("list-tag");
  });

  it("returns no results for unknown query", async () => {
    const result = await recall(`nonexistent-${Date.now()}`);
    expect(result).toContain("No memories found");
  });
});
