// BlackWhite — MCP DevKit
import { spawn } from "child_process";

interface GitError {
  code: string;
  message: string;
  suggestion?: string;
}

interface BranchHealth {
  name: string;
  ahead: number;
  behind: number;
  stale: boolean;
  hasUncommitted: boolean;
  lastCommitAge: string;
}

interface CommitQuality {
  hash: string;
  message: string;
  score: number;
  issues: string[];
}

interface WorkflowAnalysis {
  type: "GitFlow" | "TrunkBased" | "FeatureBranch" | "Unknown";
  branches: string[];
  mainBranch: string;
  recommendations: string[];
}

function runGit(args: string[], cwd?: string, timeout = 15000): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: cwd || process.cwd(),
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeout);

    child.stdout?.on("data", (data: Buffer) => {
      stdout += data.toString("utf-8");
    });

    child.stderr?.on("data", (data: Buffer) => {
      stderr += data.toString("utf-8");
    });

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout: "", stderr: err.message, exitCode: -1 });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: code });
    });
  });
}

function parseGitError(stderr: string): GitError {
  if (stderr.includes("not a git repository")) {
    return { code: "NOT_REPO", message: "Not a git repository", suggestion: "Initialize with 'git init'" };
  }
  if (stderr.includes("nothing to commit")) {
    return { code: "NOTHING_TO_COMMIT", message: "Nothing to commit", suggestion: "Make changes to tracked files" };
  }
  if (stderr.includes("conflict")) {
    return { code: "MERGE_CONFLICT", message: "Merge conflict detected", suggestion: "Resolve conflicts and continue" };
  }
  if (stderr.includes("ahead of")) {
    return { code: "AHEAD", message: "Branch is ahead of remote", suggestion: "Push changes with 'git push'" };
  }
  if (stderr.includes("behind")) {
    return { code: "BEHIND", message: "Branch is behind remote", suggestion: "Pull changes with 'git pull'" };
  }
  if (stderr.includes("diverged")) {
    return { code: "DIVERGED", message: "Branch has diverged from remote", suggestion: "Rebase or merge remote changes" };
  }
  return { code: "UNKNOWN", message: stderr, suggestion: "Check git status for details" };
}

export async function gitStatus(repoPath?: string): Promise<string> {
  const result = await runGit(["status", "--short", "--branch"], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || "Working tree clean.";
}

export async function gitLog(repoPath?: string, count = 10): Promise<string> {
  const result = await runGit(
    ["log", `--max-count=${count}`, "--oneline", "--decorate"],
    repoPath
  );
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || "No commits found.";
}

export async function gitDiff(repoPath?: string, target?: string): Promise<string> {
  const args = target ? ["diff", target] : ["diff"];
  const result = await runGit(args, repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return "No changes.";
  // Truncate huge diffs
  return result.stdout.length > 50000 ? result.stdout.slice(0, 50000) + "\n... (truncated)" : result.stdout;
}

export async function gitAdd(files: string | string[], repoPath?: string): Promise<string> {
  const fileList = Array.isArray(files) ? files : [files];
  const result = await runGit(["add", ...fileList], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || `Staged ${fileList.length} file(s).`;
}

export async function gitCommit(message: string, repoPath?: string): Promise<string> {
  const result = await runGit(["commit", "-m", message], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || "Committed successfully.";
}

export async function gitBranches(repoPath?: string): Promise<string> {
  const result = await runGit(
    ["branch", "-a", "--format=%(refname:short) %(upstream:short) %(HEAD)"],
    repoPath
  );
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return "No branches found.";

  const lines = result.stdout.split("\n").filter(Boolean);
  const branchData = {
    current: lines.find((l) => l.includes("*"))?.replace("*", "").trim().split(" ")[0] || "?",
    branches: lines.map((l) => {
      const isCurrent = l.includes("*");
      const clean = l.replace("*", "").trim();
      const parts = clean.split(" ");
      return {
        name: parts[0],
        upstream: parts[1] || null,
        current: isCurrent,
      };
    }),
  };
  return JSON.stringify(branchData, null, 2);
}

export async function gitCheckout(branch: string, create = false, repoPath?: string): Promise<string> {
  const args = create ? ["checkout", "-b", branch] : ["checkout", branch];
  const result = await runGit(args, repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || `Switched to ${create ? "new" : ""} branch '${branch}'.`;
}

// ─── Stash ───────────────────────────

export async function gitStash(message?: string, repoPath?: string): Promise<string> {
  const args = message ? ["stash", "push", "-m", message] : ["stash", "push"];
  const result = await runGit(args, repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || "Changes stashed.";
}

export async function gitStashPop(index = 0, repoPath?: string): Promise<string> {
  const result = await runGit(["stash", "pop", `stash@{${index}}`], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || "Stash popped.";
}

export async function gitStashList(repoPath?: string): Promise<string> {
  const result = await runGit(["stash", "list", "--format=%h %gd %s"], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return "No stashes found.";
  const lines = result.stdout.split("\n").filter(Boolean).map((l) => {
    const parts = l.split(" ");
    return { hash: parts[0], ref: parts[1], message: parts.slice(2).join(" ") };
  });
  return JSON.stringify({ count: lines.length, stashes: lines }, null, 2);
}

// ─── Unstage / Restore ───────────────

export async function gitUnstage(files: string | string[], repoPath?: string): Promise<string> {
  const fileList = Array.isArray(files) ? files : [files];
  const result = await runGit(["restore", "--staged", ...fileList], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || `Unstaged ${fileList.length} file(s).`;
}

export async function gitRestore(files: string | string[], repoPath?: string): Promise<string> {
  const fileList = Array.isArray(files) ? files : [files];
  const result = await runGit(["restore", ...fileList], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || `Restored ${fileList.length} file(s) to HEAD.`;
}

// ─── Push / Pull / Remote ────────────

export async function gitPush(remote?: string, branch?: string, force = false, repoPath?: string): Promise<string> {
  const args = ["push"];
  if (force) args.push("--force-with-lease");
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  const result = await runGit(args, repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || "Pushed successfully.";
}

export async function gitPull(remote?: string, branch?: string, repoPath?: string): Promise<string> {
  const args = ["pull"];
  if (remote) args.push(remote);
  if (branch) args.push(branch);
  const result = await runGit(args, repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || "Pulled successfully.";
}

export async function gitRemote(repoPath?: string): Promise<string> {
  const result = await runGit(["remote", "-v"], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return "No remotes configured.";
  const remotes: Record<string, { fetch: string; push: string }> = {};
  for (const line of result.stdout.split("\n").filter(Boolean)) {
    const match = line.match(/^(\S+)\s+(\S+)\s+\((fetch|push)\)$/);
    if (match) {
      const [, name, url, type] = match;
      if (!remotes[name]) remotes[name] = { fetch: "", push: "" };
      remotes[name][type as "fetch" | "push"] = url;
    }
  }
  return JSON.stringify(remotes, null, 2);
}

// ─── Merge / Rebase ──────────────────

export async function gitMerge(branch: string, noFastForward = false, repoPath?: string): Promise<string> {
  const args = noFastForward ? ["merge", "--no-ff", branch] : ["merge", branch];
  const result = await runGit(args, repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || `Merged '${branch}'.`;
}

export async function gitRebase(branch: string, repoPath?: string): Promise<string> {
  const result = await runGit(["rebase", branch], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || `Rebased onto '${branch}'.`;
}

// ─── Tags ────────────────────────────

export async function gitTags(repoPath?: string): Promise<string> {
  const result = await runGit(["tag", "-l", "--format=%(refname:short) %(objectname:short) %(taggerdate:short) %(subject)"], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return "No tags found.";
  const lines = result.stdout.split("\n").filter(Boolean).map((l) => {
    const parts = l.split(" ");
    return { name: parts[0], hash: parts[1], date: parts[2], message: parts.slice(3).join(" ") };
  });
  return JSON.stringify({ count: lines.length, tags: lines }, null, 2);
}

export async function gitCreateTag(name: string, message?: string, repoPath?: string): Promise<string> {
  const args = message ? ["tag", "-a", name, "-m", message] : ["tag", name];
  const result = await runGit(args, repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  return result.stdout || `Created tag '${name}'.`;
}

// ─── Blame / Show ────────────────────

export async function gitBlame(filePath: string, startLine?: number, endLine?: number, repoPath?: string): Promise<string> {
  const args = ["blame", "-e"];
  if (startLine && endLine) args.push(`-L${startLine},${endLine}`);
  args.push(filePath);
  const result = await runGit(args, repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return `No blame data for ${filePath}.`;
  const lines = result.stdout.split("\n").map((l) => {
    const match = l.match(/^([a-f0-9]+)\s+.*?\((.+?)\s+.*?\)\s+(.*)$/);
    if (match) {
      return { commit: match[1].slice(0, 8), author: match[2].trim(), line: match[3] };
    }
    return l;
  });
  return JSON.stringify({ file: filePath, lines: lines.slice(0, 100) }, null, 2);
}

export async function gitShow(commit: string, repoPath?: string): Promise<string> {
  const result = await runGit(["show", "--stat", "--oneline", commit], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return `Commit ${commit} not found.`;
  const stats = result.stdout.split("\n").filter((l) => l.includes("|"));
  const summary = result.stdout.split("\n")[0] || "";
  return JSON.stringify(
    {
      commit: summary.split(" ")[0],
      message: summary.split(" ").slice(1).join(" "),
      stats,
    },
    null,
    2
  );
}

// ─── Advanced Git Analysis ─────────────

export async function analyzeBranchHealth(repoPath?: string): Promise<string> {
  const result = await runGit(["branch", "-vv"], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return "No branches found.";

  const branches: BranchHealth[] = [];
  const lines = result.stdout.split("\n").filter(Boolean);

  for (const line of lines) {
    const match = line.match(/^[\* ]\s+(\S+)\s+([a-f0-9]+)\s+\[([^\]]+)\]/);
    if (match) {
      const [, name, , upstream] = match;
      const aheadMatch = upstream.match(/ahead\s+(\d+)/);
      const behindMatch = upstream.match(/behind\s+(\d+)/);
      const isCurrent = line.startsWith("*");

      // Check if branch is stale (no commits in 90 days)
      const logResult = await runGit(["log", "-1", "--format=%ct", name], repoPath);
      const lastCommit = parseInt(logResult.stdout || "0");
      const daysSinceCommit = Math.floor((Date.now() / 1000 - lastCommit) / 86400);
      const stale = daysSinceCommit > 90;

      // Check for uncommitted changes
      const statusResult = await runGit(["status", "--porcelain"], repoPath);
      const hasUncommitted = statusResult.stdout.length > 0 && isCurrent;

      branches.push({
        name,
        ahead: aheadMatch ? parseInt(aheadMatch[1]) : 0,
        behind: behindMatch ? parseInt(behindMatch[1]) : 0,
        stale,
        hasUncommitted,
        lastCommitAge: daysSinceCommit > 0 ? `${daysSinceCommit} days ago` : "today",
      });
    }
  }

  return JSON.stringify({ branches, summary: analyzeBranchSummary(branches) }, null, 2);
}

function analyzeBranchSummary(branches: BranchHealth[]) {
  const stale = branches.filter(b => b.stale).length;
  const ahead = branches.filter(b => b.ahead > 0).length;
  const behind = branches.filter(b => b.behind > 0).length;
  return {
    total: branches.length,
    stale,
    needsPush: ahead,
    needsPull: behind,
    healthy: branches.length - stale - ahead - behind,
  };
}

export async function analyzeWorkflow(repoPath?: string): Promise<string> {
  const result = await runGit(["branch", "-a"], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return "No branches found.";

  const branches = result.stdout.split("\n").filter(Boolean).map((l) => l.replace("*", "").trim().replace("remotes/", ""));
  const localBranches = branches.filter((b) => !b.includes("/"));

  let workflowType: WorkflowAnalysis["type"] = "Unknown";
  const mainBranch = localBranches.find((b) => ["main", "master", "develop"].includes(b)) || localBranches[0] || "main";
  const recommendations: string[] = [];

  // Detect GitFlow
  if (localBranches.includes("develop") && localBranches.some((b) => b.startsWith("feature/"))) {
    workflowType = "GitFlow";
    recommendations.push("GitFlow workflow detected. Ensure proper branch naming conventions.");
  }
  // Detect Trunk-Based
  else if (localBranches.length <= 2 || localBranches.every((b) => b === mainBranch || b.startsWith("hotfix/"))) {
    workflowType = "TrunkBased";
    recommendations.push("Trunk-based development detected. Consider using feature flags for releases.");
  }
  // Detect Feature Branch
  else if (localBranches.some((b) => b.startsWith("feature/") || b.startsWith("feat/"))) {
    workflowType = "FeatureBranch";
    recommendations.push("Feature branch workflow detected. Keep branches short-lived and merge frequently.");
  }

  return JSON.stringify({
    type: workflowType,
    branches: localBranches,
    mainBranch,
    recommendations,
  }, null, 2);
}

export async function scoreCommitQuality(repoPath?: string, limit = 10): Promise<string> {
  const result = await runGit(["log", `--max-count=${limit}`, "--format=%H %s"], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }
  if (!result.stdout) return "No commits found.";

  const commits: CommitQuality[] = [];
  const lines = result.stdout.split("\n").filter(Boolean);

  for (const line of lines) {
    const [hash, ...messageParts] = line.split(" ");
    const message = messageParts.join(" ");
    const issues: string[] = [];
    let score = 100;

    // Conventional commits check
    if (!message.match(/^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert|BREAKING)/)) {
      issues.push("Not following conventional commits");
      score -= 20;
    }

    // Message length check
    if (message.length < 10) {
      issues.push("Message too short");
      score -= 30;
    }
    if (message.length > 72) {
      issues.push("Message too long (should be under 72 chars)");
      score -= 10;
    }

    // Imperative mood check
    if (!message.match(/^[a-z]/)) {
      issues.push("Not using imperative mood");
      score -= 10;
    }

    // Period check
    if (message.endsWith(".")) {
      issues.push("Message should not end with period");
      score -= 5;
    }

    commits.push({
      hash: hash.slice(0, 8),
      message,
      score: Math.max(0, score),
      issues,
    });
  }

  return JSON.stringify({ commits, averageScore: Math.round(commits.reduce((a, c) => a + c.score, 0) / commits.length) }, null, 2);
}

export async function detectConflicts(repoPath?: string): Promise<string> {
  const result = await runGit(["status", "--porcelain"], repoPath);
  if (result.exitCode !== 0 && result.stderr) {
    const error = parseGitError(result.stderr);
    return JSON.stringify(error, null, 2);
  }

  const conflicts: Array<{ file: string; type: string }> = [];
  const lines = result.stdout.split("\n").filter(Boolean);

  for (const line of lines) {
    if (line.startsWith("UU")) {
      const file = line.slice(2);
      conflicts.push({ file, type: "both_modified" });
    }
    if (line.startsWith("AA")) {
      const file = line.slice(2);
      conflicts.push({ file, type: "both_added" });
    }
    if (line.startsWith("DD")) {
      const file = line.slice(2);
      conflicts.push({ file, type: "both_deleted" });
    }
  }

  if (conflicts.length === 0) {
    return JSON.stringify({ hasConflicts: false, message: "No merge conflicts detected." }, null, 2);
  }

  return JSON.stringify({
    hasConflicts: true,
    conflicts,
    suggestions: [
      "Review conflict markers in affected files",
      "Use 'git diff' to see conflict details",
      "Resolve conflicts and stage files",
      "Run 'git status' to verify resolution",
    ],
  }, null, 2);
}

export async function getGitConfig(repoPath?: string): Promise<string> {
  const localResult = await runGit(["config", "--local", "--list"], repoPath);
  const globalResult = await runGit(["config", "--global", "--list"]);

  const parseConfig = (output: string) => {
    const config: Record<string, string> = {};
    for (const line of output.split("\n").filter(Boolean)) {
      const [key, ...valueParts] = line.split("=");
      config[key] = valueParts.join("=");
    }
    return config;
  };

  return JSON.stringify({
    local: parseConfig(localResult.stdout),
    global: parseConfig(globalResult.stdout),
  }, null, 2);
}
