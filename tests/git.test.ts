// BlackWhite — MCP DevKit
import { describe, it, expect } from "vitest";
import { gitStatus, gitLog, gitRemote, gitShow, gitBranches } from "../src/git-tools.js";

describe("git-tools", () => {
  it("returns git status", async () => {
    const result = await gitStatus(".");
    expect(result.length).toBeGreaterThan(0);
  });

  it("returns git log", async () => {
    const result = await gitLog(".", 5);
    expect(result).toContain("feat:");
  });

  it("returns branches", async () => {
    const result = await gitBranches(".");
    const parsed = JSON.parse(result);
    expect(parsed.current).toBe("main");
    expect(parsed.branches.length).toBeGreaterThan(0);
  });

  it("returns remotes", async () => {
    const result = await gitRemote(".");
    const parsed = JSON.parse(result);
    expect(parsed.origin).toBeTruthy();
    expect(parsed.origin.fetch).toContain("github.com");
  });

  it("shows a commit", async () => {
    const result = await gitShow("HEAD", ".");
    const parsed = JSON.parse(result);
    expect(parsed.commit).toBeTruthy();
    expect(parsed.message).toBeTruthy();
  });
});
