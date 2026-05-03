import { describe, it, expect } from "vitest";
import { runCommand } from "../src/terminal.js";

describe("terminal", () => {
  it("echoes a simple command", async () => {
    const result = await runCommand("echo hello-world");
    const parsed = JSON.parse(result);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.stdout).toContain("hello-world");
  });

  it("returns non-zero for unknown command", async () => {
    const result = await runCommand("thiscommanddoesnotexist12345");
    const parsed = JSON.parse(result);
    expect(parsed.exitCode).not.toBe(0);
  });

  it("runs in a specific directory", async () => {
    const result = await runCommand("node -e \"console.log(process.cwd())\"");
    const parsed = JSON.parse(result);
    expect(parsed.exitCode).toBe(0);
    expect(parsed.stdout.length).toBeGreaterThan(0);
  });
});
