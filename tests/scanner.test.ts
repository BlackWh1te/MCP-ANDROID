import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { scanProject, getProjectSummary, explainArchitecture } from "../src/scanner.js";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

async function createMockProject(base: string, files: Record<string, string>) {
  await fs.mkdir(base, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    const full = path.join(base, file);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf-8");
  }
}

async function rmDir(dir: string) {
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch {
    // ignore
  }
}

describe("scanner", () => {
  const tmpDir = path.join(os.tmpdir(), "mcp-devkit-test-scanner");

  beforeAll(async () => {
    await rmDir(tmpDir);
    await createMockProject(tmpDir, {
      "package.json": JSON.stringify({ name: "test-app", dependencies: { react: "^18", next: "^14" } }),
      "src/index.ts": "console.log('hello')",
      "src/components/Button.tsx": "export default () => <button>Click</button>",
      "README.md": "# Test App",
      ".gitignore": "node_modules\n",
      "package-lock.json": "{}",
    });
  });

  afterAll(async () => {
    await rmDir(tmpDir);
  });

  it("detects Node.js and React/Next.js", async () => {
    const result = await scanProject(tmpDir, 3);
    expect(result.techStack.languages).toContain("Node.js");
    expect(result.techStack.frameworks).toContain("React");
    expect(result.techStack.frameworks).toContain("Next.js");
    expect(result.techStack.buildTools).toContain("npm");
    expect(result.fileCount).toBeGreaterThanOrEqual(4);
  });

  it("produces a human-readable summary", async () => {
    const summary = await getProjectSummary(tmpDir);
    expect(summary).toContain("Project Summary");
    expect(summary).toContain("Node.js");
  });

  it("produces an architecture overview", async () => {
    const arch = await explainArchitecture(tmpDir);
    expect(arch).toContain("Architecture Overview");
    expect(arch).toContain("React");
  });
});
