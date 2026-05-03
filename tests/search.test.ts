import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { searchCode, getFileContext } from "../src/search.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

describe("search", () => {
  const tmpDir = path.join(os.tmpdir(), "mcp-devkit-test-search");

  beforeAll(async () => {
    await fs.mkdir(tmpDir, { recursive: true });
    await fs.writeFile(path.join(tmpDir, "hello.ts"), "export function hello() { return 'world'; }\n// TODO: add tests", "utf-8");
    await fs.writeFile(path.join(tmpDir, "utils.ts"), "export const util = () => 42;\n", "utf-8");
  });

  afterAll(async () => {
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it("finds literal matches", async () => {
    const result = await searchCode("TODO", tmpDir, true);
    expect(result).toContain("TODO");
    expect(result).toContain("hello.ts");
  });

  it("finds regex matches", async () => {
    const result = await searchCode("export (function|const)", tmpDir);
    expect(result).toContain("hello.ts");
    expect(result).toContain("utils.ts");
  });

  it("returns no matches for unknown query", async () => {
    const result = await searchCode("NONEXISTENT_QUERY_12345", tmpDir);
    expect(result).toContain("No matches found");
  });

  it("reads a file with line range", async () => {
    const content = await getFileContext(path.join(tmpDir, "hello.ts"), 1, 2);
    expect(content).toContain("hello.ts");
    expect(content).toContain("export function hello()");
  });
});
