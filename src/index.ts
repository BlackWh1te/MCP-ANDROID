#!/usr/bin/env node
// BlackWhite — MCP DevKit
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  TextContent,
} from "@modelcontextprotocol/sdk/types.js";

import { scanProject, getProjectSummary, explainArchitecture } from "./scanner.js";
import { remember, recall, listMemories, deduplicateMemories, summarizeMemory, findRelatedMemories, exportMemories, importMemories } from "./memory.js";
import { runCommand } from "./terminal.js";
import {
  gitStatus, gitLog, gitDiff,
  gitAdd, gitCommit, gitBranches, gitCheckout,
  gitStash, gitStashPop, gitStashList,
  gitUnstage, gitRestore,
  gitPush, gitPull, gitRemote,
  gitMerge, gitRebase,
  gitTags, gitCreateTag,
  gitBlame, gitShow,
  analyzeBranchHealth,
  analyzeWorkflow,
  scoreCommitQuality,
  detectConflicts,
  getGitConfig,
} from "./git-tools.js";
import { searchCode, getFileContext } from "./search.js";
import { readFile, writeFile, editFile, deleteFile, moveFile, copyFile, createDirectory, removeDirectory, listDirectory } from "./files.js";
import { httpRequest } from "./http.js";
import { listProcesses, killProcess } from "./process.js";
import { getSystemInfo, checkPort, getEnvFile } from "./system.js";
import { getCodeStats } from "./stats.js";
import { generateCommitMessage } from "./ai-commit.js";
import { getPackageScripts, runPackageScript } from "./package-runner.js";
import {
  generateUUID, hashText, base64Encode, base64Decode,
  urlEncode, urlDecode, formatJson,
  getCurrentTime, convertTime,
} from "./utils.js";
import { think, getThoughts, clearThinking } from "./thinking.js";
import { dbSet, dbGet, dbDelete, dbList, dbQuery } from "./database.js";
import { fetchText, fetchJson, getFileInfo, directoryTree } from "./web.js";
import {
  diffText, regexTest, generatePassword, jwtDecode,
  analyzeText, convertColor, evaluateMath,
} from "./dev-utils.js";
import { createTodo, listTodos, completeTodo, deleteTodo } from "./todos.js";

const server = new Server(
  {
    name: "mcp-devkit",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "scan_project",
        description:
          "Deep-scan a directory to detect project structure, tech stack, frameworks, and key files. Returns structured JSON with languages, entry points, dependencies, and architecture hints. Works on any OS.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Absolute or relative path to the project directory",
            },
            depth: {
              type: "number",
              description: "Max directory depth to scan (default: 5)",
              default: 5,
            },
          },
          required: ["path"],
        },
      },
      {
        name: "get_project_summary",
        description:
          "Get a concise, human-readable summary of the scanned project: what it is, what tech it uses, how to run it.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the project directory",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "explain_architecture",
        description:
          "Analyze the project and return a high-level architecture description: entry points, module relationships, data flow.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Path to the project directory",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "remember",
        description:
          "Store a persistent memory item (fact, TODO, decision, context) that the AI can recall later, even across sessions.",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "Short unique key or topic (e.g., 'auth-decision', 'todo-api')",
            },
            content: {
              type: "string",
              description: "The full text to remember",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Optional tags for filtering",
              default: [],
            },
          },
          required: ["key", "content"],
        },
      },
      {
        name: "recall",
        description:
          "Search stored memories by keyword. Returns the most relevant matches.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Keyword or phrase to search for",
            },
            limit: {
              type: "number",
              description: "Max results (default: 10)",
              default: 10,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "list_memories",
        description: "List all stored memory keys and tags.",
        inputSchema: {
          type: "object",
          properties: {
            tag: {
              type: "string",
              description: "Optional tag filter",
            },
          },
        },
      },
      {
        name: "deduplicate_memories",
        description: "Find and report duplicate or similar memories using similarity analysis.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "summarize_memory",
        description: "Generate or retrieve a summary for a specific memory.",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "Memory key to summarize",
            },
          },
          required: ["key"],
        },
      },
      {
        name: "find_related_memories",
        description: "Find memories related to a specific memory based on content and tags.",
        inputSchema: {
          type: "object",
          properties: {
            key: {
              type: "string",
              description: "Memory key to find relations for",
            },
            threshold: {
              type: "number",
              description: "Similarity threshold (default: 0.3)",
              default: 0.3,
            },
          },
          required: ["key"],
        },
      },
      {
        name: "export_memories",
        description: "Export all memories to a backup JSON file.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "import_memories",
        description: "Import memories from a backup JSON file.",
        inputSchema: {
          type: "object",
          properties: {
            backupPath: {
              type: "string",
              description: "Path to backup JSON file",
            },
          },
          required: ["backupPath"],
        },
      },
      {
        name: "run_command",
        description:
          "Execute a terminal command safely. Auto-detects Windows (CMD/PowerShell) vs Unix (bash/sh). Returns stdout, stderr, and exit code. Use with care.",
        inputSchema: {
          type: "object",
          properties: {
            command: {
              type: "string",
              description: "The command to run",
            },
            cwd: {
              type: "string",
              description: "Working directory (default: current)",
            },
            shell: {
              type: "string",
              description: "Override shell: 'cmd', 'powershell', 'bash', 'sh'",
            },
            timeout: {
              type: "number",
              description: "Timeout in ms (default: 30000)",
              default: 30000,
            },
          },
          required: ["command"],
        },
      },
      {
        name: "git_status",
        description: "Get git status of a repository: modified, staged, untracked files.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_log",
        description: "Get recent git commit history.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
            count: {
              type: "number",
              description: "Number of commits (default: 10)",
              default: 10,
            },
          },
        },
      },
      {
        name: "git_diff",
        description: "Get git diff: unstaged changes, or between branches/commits.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
            target: {
              type: "string",
              description: "Branch, commit, or 'HEAD' for unstaged (default: unstaged)",
            },
          },
        },
      },
      {
        name: "search_code",
        description:
          "Search code across the project using regex or literal string. Respects .gitignore. Returns context and relevance scores.",
        inputSchema: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "Regex pattern or literal string",
            },
            path: {
              type: "string",
              description: "Directory to search (default: current)",
            },
            literal: {
              type: "boolean",
              description: "If true, treat query as literal string (default: false)",
              default: false,
            },
            maxResults: {
              type: "number",
              description: "Max matches (default: 50)",
              default: 50,
            },
            ext: {
              type: "string",
              description: "Filter by file extension, e.g., '.ts' or '.py'",
            },
            caseSensitive: {
              type: "boolean",
              description: "Case-sensitive search (default: false)",
              default: false,
            },
            contextLines: {
              type: "number",
              description: "Context lines before/after match (default: 2)",
              default: 2,
            },
          },
          required: ["query"],
        },
      },
      {
        name: "get_file_context",
        description:
          "Read a file with smart chunking. Returns the file content, or a specific range/lines.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Absolute or relative path to the file",
            },
            startLine: {
              type: "number",
              description: "Start line (1-based, default: 1)",
              default: 1,
            },
            endLine: {
              type: "number",
              description: "End line (inclusive, default: file end)",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "read_file",
        description: "Read the full contents of a file as text.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the file",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "write_file",
        description: "Write text content to a file. Creates directories if needed. Overwrites existing files.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the file",
            },
            content: {
              type: "string",
              description: "Content to write",
            },
          },
          required: ["filePath", "content"],
        },
      },
      {
        name: "edit_file",
        description: "Replace a unique string in a file. Returns an error if the string is not found or appears more than once.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the file",
            },
            oldString: {
              type: "string",
              description: "Exact string to replace (must be unique in file)",
            },
            newString: {
              type: "string",
              description: "Replacement string",
            },
          },
          required: ["filePath", "oldString", "newString"],
        },
      },
      {
        name: "delete_file",
        description: "Delete a single file safely. Refuses to delete directories.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the file to delete",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "list_directory",
        description: "List files and directories with a nice tree view, respecting max depth.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Directory path (default: current)",
              default: ".",
            },
            depth: {
              type: "number",
              description: "Max depth (default: 1)",
              default: 1,
            },
          },
        },
      },
      {
        name: "http_request",
        description: "Make HTTP GET/POST/PUT/DELETE requests with optional headers and body. Returns status, headers, and body.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description: "URL to request",
            },
            method: {
              type: "string",
              description: "HTTP method (default: GET)",
              default: "GET",
            },
            headers: {
              type: "object",
              description: "Optional headers as key-value pairs",
            },
            body: {
              type: "string",
              description: "Request body (for POST/PUT/PATCH)",
            },
            timeout: {
              type: "number",
              description: "Timeout in ms (default: 30000)",
              default: 30000,
            },
          },
          required: ["url"],
        },
      },
      {
        name: "list_processes",
        description: "List running processes (cross-platform: Windows tasklist, Unix ps). Returns PID, name, CPU, memory.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "kill_process",
        description: "Kill a process by PID. Cross-platform (taskkill on Windows, kill on Unix).",
        inputSchema: {
          type: "object",
          properties: {
            pid: {
              type: "string",
              description: "Process ID to kill",
            },
          },
          required: ["pid"],
        },
      },
      {
        name: "get_system_info",
        description: "Get system information: OS, architecture, memory, CPU count, Node version, environment variables.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "check_port",
        description: "Check if a TCP port is available or in use on a host.",
        inputSchema: {
          type: "object",
          properties: {
            port: {
              type: "number",
              description: "Port number to check",
            },
            host: {
              type: "string",
              description: "Host to check (default: 127.0.0.1)",
              default: "127.0.0.1",
            },
          },
          required: ["port"],
        },
      },
      {
        name: "get_env_file",
        description: "Read a .env file and return variable names with values (secrets masked).",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to env file (default: .env)",
              default: ".env",
            },
          },
        },
      },
      {
        name: "get_code_stats",
        description: "Analyze code statistics: lines of code, language breakdown, TODO/FIXME counts, file sizes. Cross-platform.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Project path (default: current)",
              default: ".",
            },
          },
        },
      },
      {
        name: "generate_commit_message",
        description: "AI-powered commit message generator. Analyzes staged (or unstaged) git diff and suggests a conventional commit message with type, scope, and summary.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_add",
        description: "Stage files for commit.",
        inputSchema: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: { type: "string" },
              description: "File paths to stage (use ['.'] for all)",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["files"],
        },
      },
      {
        name: "git_commit",
        description: "Commit staged changes with a message.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Commit message",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["message"],
        },
      },
      {
        name: "git_branches",
        description: "List all git branches with current branch marker.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_checkout",
        description: "Switch to an existing branch or create a new one.",
        inputSchema: {
          type: "object",
          properties: {
            branch: {
              type: "string",
              description: "Branch name",
            },
            create: {
              type: "boolean",
              description: "Create the branch if it doesn't exist",
              default: false,
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["branch"],
        },
      },
      {
        name: "git_stash",
        description: "Stash current changes. Optionally provide a message.",
        inputSchema: {
          type: "object",
          properties: {
            message: {
              type: "string",
              description: "Optional stash message",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_stash_pop",
        description: "Pop a stash from the stash list. Default pops the most recent (index 0).",
        inputSchema: {
          type: "object",
          properties: {
            index: {
              type: "number",
              description: "Stash index (default: 0)",
              default: 0,
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_stash_list",
        description: "List all stashes.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_unstage",
        description: "Unstage files (remove from staging area but keep changes).",
        inputSchema: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: { type: "string" },
              description: "Files to unstage (use ['.'] for all)",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["files"],
        },
      },
      {
        name: "git_restore",
        description: "Restore files to their last committed state (discards changes).",
        inputSchema: {
          type: "object",
          properties: {
            files: {
              type: "array",
              items: { type: "string" },
              description: "Files to restore (use ['.'] for all)",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["files"],
        },
      },
      {
        name: "git_push",
        description: "Push commits to a remote repository. Supports force-with-lease for safe force push.",
        inputSchema: {
          type: "object",
          properties: {
            remote: {
              type: "string",
              description: "Remote name (default: origin)",
            },
            branch: {
              type: "string",
              description: "Branch name",
            },
            force: {
              type: "boolean",
              description: "Use --force-with-lease (safer than bare force)",
              default: false,
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_pull",
        description: "Pull changes from a remote repository.",
        inputSchema: {
          type: "object",
          properties: {
            remote: {
              type: "string",
              description: "Remote name (default: origin)",
            },
            branch: {
              type: "string",
              description: "Branch name",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_remote",
        description: "List configured remotes with their fetch/push URLs.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_merge",
        description: "Merge a branch into the current branch.",
        inputSchema: {
          type: "object",
          properties: {
            branch: {
              type: "string",
              description: "Branch to merge",
            },
            noFastForward: {
              type: "boolean",
              description: "Create a merge commit even if fast-forward is possible",
              default: false,
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["branch"],
        },
      },
      {
        name: "git_rebase",
        description: "Rebase current branch onto another branch.",
        inputSchema: {
          type: "object",
          properties: {
            branch: {
              type: "string",
              description: "Branch to rebase onto",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["branch"],
        },
      },
      {
        name: "git_tags",
        description: "List all tags.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "git_create_tag",
        description: "Create a new tag. Optionally annotate with a message.",
        inputSchema: {
          type: "object",
          properties: {
            name: {
              type: "string",
              description: "Tag name (e.g., v1.0.0)",
            },
            message: {
              type: "string",
              description: "Optional annotated tag message",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["name"],
        },
      },
      {
        name: "git_blame",
        description: "Show who last modified each line of a file (git blame).",
        inputSchema: {
          type: "object",
          properties: {
            filePath: {
              type: "string",
              description: "Path to the file",
            },
            startLine: {
              type: "number",
              description: "Start line (1-based, optional)",
            },
            endLine: {
              type: "number",
              description: "End line (inclusive, optional)",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["filePath"],
        },
      },
      {
        name: "git_show",
        description: "Show details of a commit: stats, changed files, message.",
        inputSchema: {
          type: "object",
          properties: {
            commit: {
              type: "string",
              description: "Commit hash or ref (e.g., HEAD, abc1234)",
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
          required: ["commit"],
        },
      },
      {
        name: "analyze_branch_health",
        description: "Analyze branch health: stale branches, uncommitted changes, ahead/behind status.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "analyze_workflow",
        description: "Detect git workflow type (GitFlow, Trunk-Based, Feature Branch) and provide recommendations.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "score_commit_quality",
        description: "Score commit message quality based on conventional commits, length, and style.",
        inputSchema: {
          type: "object",
          properties: {
            limit: {
              type: "number",
              description: "Number of recent commits to analyze (default: 10)",
              default: 10,
            },
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "detect_conflicts",
        description: "Detect merge conflicts and provide resolution suggestions.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "get_git_config",
        description: "Get local and global git configuration.",
        inputSchema: {
          type: "object",
          properties: {
            repoPath: {
              type: "string",
              description: "Path to git repository (default: current)",
            },
          },
        },
      },
      {
        name: "get_package_scripts",
        description: "Detect and list available package scripts from package.json, pyproject.toml, Makefile, or Cargo.toml.",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "Project path (default: current)",
              default: ".",
            },
          },
        },
      },
      {
        name: "run_package_script",
        description: "Run a package script using the detected package manager (npm/yarn/pnpm/bun/make/cargo).",
        inputSchema: {
          type: "object",
          properties: {
            script: {
              type: "string",
              description: "Script name to run (e.g., 'test', 'build', 'dev')",
            },
            path: {
              type: "string",
              description: "Project path (default: current)",
              default: ".",
            },
          },
          required: ["script"],
        },
      },
      {
        name: "generate_uuid",
        description: "Generate a random UUID v4.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "hash_text",
        description: "Hash text using md5, sha1, sha256, or sha512.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to hash" },
            algorithm: { type: "string", description: "Hash algorithm (default: sha256)", default: "sha256" },
          },
          required: ["text"],
        },
      },
      {
        name: "base64_encode",
        description: "Base64-encode text.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", description: "Text to encode" } },
          required: ["text"],
        },
      },
      {
        name: "base64_decode",
        description: "Base64-decode text.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", description: "Base64 string to decode" } },
          required: ["text"],
        },
      },
      {
        name: "url_encode",
        description: "URL-encode a string.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", description: "Text to encode" } },
          required: ["text"],
        },
      },
      {
        name: "url_decode",
        description: "URL-decode a string.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", description: "URL-encoded text to decode" } },
          required: ["text"],
        },
      },
      {
        name: "format_json",
        description: "Pretty-print and validate JSON.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string", description: "JSON string to format" } },
          required: ["text"],
        },
      },
      {
        name: "get_current_time",
        description: "Get current time. Optionally specify an IANA timezone (e.g., America/New_York).",
        inputSchema: {
          type: "object",
          properties: { timezone: { type: "string", description: "IANA timezone name (optional)" } },
        },
      },
      {
        name: "convert_time",
        description: "Convert a time between IANA timezones.",
        inputSchema: {
          type: "object",
          properties: {
            time: { type: "string", description: "Time in 24h format (HH:MM)" },
            sourceTimezone: { type: "string", description: "Source IANA timezone" },
            targetTimezone: { type: "string", description: "Target IANA timezone" },
          },
          required: ["time", "sourceTimezone", "targetTimezone"],
        },
      },
      {
        name: "think",
        description: "Sequential thinking tool. Add a thought to a chain-of-thought session. Great for reasoning, planning, debugging.",
        inputSchema: {
          type: "object",
          properties: {
            thought: { type: "string", description: "Your thought text" },
            thoughtNumber: { type: "number", description: "Which thought number this is (1, 2, 3...)" },
            totalThoughts: { type: "number", description: "Estimated total thoughts in chain" },
            nextThoughtNeeded: { type: "boolean", description: "Whether another thought is needed", default: true },
            isRevision: { type: "boolean", description: "Is this a revision of a previous thought?", default: false },
            revisesThought: { type: "number", description: "If revision, which thought number it revises" },
            branchFromThought: { type: "number", description: "If branching, which thought to branch from" },
            branchId: { type: "string", description: "Branch identifier" },
          },
          required: ["thought", "thoughtNumber", "totalThoughts"],
        },
      },
      {
        name: "get_thoughts",
        description: "Retrieve the current thinking session. Optionally filter by keyword or branch.",
        inputSchema: {
          type: "object",
          properties: { filter: { type: "string", description: "Optional keyword or branch ID to filter" } },
        },
      },
      {
        name: "clear_thinking",
        description: "Clear the current thinking session.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        name: "db_set",
        description: "Store a key-value pair in a named JSON database.",
        inputSchema: {
          type: "object",
          properties: {
            store: { type: "string", description: "Database/store name" },
            key: { type: "string", description: "Key" },
            value: { type: "string", description: "Value (JSON or plain text)" },
          },
          required: ["store", "key", "value"],
        },
      },
      {
        name: "db_get",
        description: "Retrieve a value from a named JSON database.",
        inputSchema: {
          type: "object",
          properties: {
            store: { type: "string", description: "Database/store name" },
            key: { type: "string", description: "Key" },
          },
          required: ["store", "key"],
        },
      },
      {
        name: "db_delete",
        description: "Delete a key from a named JSON database.",
        inputSchema: {
          type: "object",
          properties: {
            store: { type: "string", description: "Database/store name" },
            key: { type: "string", description: "Key" },
          },
          required: ["store", "key"],
        },
      },
      {
        name: "db_list",
        description: "List keys in a named JSON database.",
        inputSchema: {
          type: "object",
          properties: {
            store: { type: "string", description: "Database/store name" },
            prefix: { type: "string", description: "Optional prefix filter" },
          },
          required: ["store"],
        },
      },
      {
        name: "db_query",
        description: "Search values in a named JSON database by content.",
        inputSchema: {
          type: "object",
          properties: {
            store: { type: "string", description: "Database/store name" },
            query: { type: "string", description: "Search query" },
          },
          required: ["store", "query"],
        },
      },
      {
        name: "fetch_text",
        description: "Fetch a URL and return text content. Strips HTML tags. Supports JSON.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch" },
            timeout: { type: "number", description: "Timeout in ms (default: 30000)", default: 30000 },
          },
          required: ["url"],
        },
      },
      {
        name: "fetch_json",
        description: "Fetch a URL and return parsed JSON.",
        inputSchema: {
          type: "object",
          properties: {
            url: { type: "string", description: "URL to fetch" },
            timeout: { type: "number", description: "Timeout in ms (default: 30000)", default: 30000 },
          },
          required: ["url"],
        },
      },
      {
        name: "get_file_info",
        description: "Get detailed file/directory metadata: size, dates, permissions.",
        inputSchema: {
          type: "object",
          properties: {
            filePath: { type: "string", description: "Path to file or directory" },
          },
          required: ["filePath"],
        },
      },
      {
        name: "directory_tree",
        description: "Display a tree view of a directory structure.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path (default: current)", default: "." },
            depth: { type: "number", description: "Max depth (default: 3)", default: 3 },
          },
        },
      },
      {
        name: "move_file",
        description: "Move or rename a file or directory.",
        inputSchema: {
          type: "object",
          properties: {
            source: { type: "string", description: "Source path" },
            destination: { type: "string", description: "Destination path" },
          },
          required: ["source", "destination"],
        },
      },
      {
        name: "copy_file",
        description: "Copy a file or directory.",
        inputSchema: {
          type: "object",
          properties: {
            source: { type: "string", description: "Source path" },
            destination: { type: "string", description: "Destination path" },
          },
          required: ["source", "destination"],
        },
      },
      {
        name: "create_directory",
        description: "Create a new directory.",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to create" },
          },
          required: ["path"],
        },
      },
      {
        name: "remove_directory",
        description: "Remove a directory (recursively if non-empty).",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string", description: "Directory path to remove" },
            recursive: { type: "boolean", description: "Remove recursively (default: false)", default: false },
          },
          required: ["path"],
        },
      },
      {
        name: "diff_text",
        description: "Compare two text strings and show differences.",
        inputSchema: {
          type: "object",
          properties: {
            text1: { type: "string", description: "First text" },
            text2: { type: "string", description: "Second text" },
            contextLines: { type: "number", description: "Context lines to show (default: 3)", default: 3 },
          },
          required: ["text1", "text2"],
        },
      },
      {
        name: "regex_test",
        description: "Test a regular expression against a string.",
        inputSchema: {
          type: "object",
          properties: {
            pattern: { type: "string", description: "Regex pattern" },
            text: { type: "string", description: "Text to test against" },
            flags: { type: "string", description: "Regex flags (g, i, m, etc.)", default: "" },
          },
          required: ["pattern", "text"],
        },
      },
      {
        name: "generate_password",
        description: "Generate a secure random password.",
        inputSchema: {
          type: "object",
          properties: {
            length: { type: "number", description: "Password length (default: 16)", default: 16 },
            includeUppercase: { type: "boolean", description: "Include uppercase letters (default: true)", default: true },
            includeLowercase: { type: "boolean", description: "Include lowercase letters (default: true)", default: true },
            includeNumbers: { type: "boolean", description: "Include numbers (default: true)", default: true },
            includeSymbols: { type: "boolean", description: "Include symbols (default: true)", default: true },
          },
        },
      },
      {
        name: "jwt_decode",
        description: "Decode a JWT token and show its payload.",
        inputSchema: {
          type: "object",
          properties: {
            token: { type: "string", description: "JWT token to decode" },
          },
          required: ["token"],
        },
      },
      {
        name: "analyze_text",
        description: "Analyze text statistics (word count, character count, sentence count, reading time).",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Text to analyze" },
          },
          required: ["text"],
        },
      },
      {
        name: "convert_color",
        description: "Convert colors between different formats (hex, rgb, hsl). Returns all formats.",
        inputSchema: {
          type: "object",
          properties: {
            color: { type: "string", description: "Color to convert (e.g., '#ff0000', 'rgb(255,0,0)')" },
          },
          required: ["color"],
        },
      },
      {
        name: "evaluate_math",
        description: "Safely evaluate mathematical expressions.",
        inputSchema: {
          type: "object",
          properties: {
            expression: { type: "string", description: "Mathematical expression to evaluate" },
          },
          required: ["expression"],
        },
      },
      {
        name: "create_todo",
        description: "Create a new todo item.",
        inputSchema: {
          type: "object",
          properties: {
            text: { type: "string", description: "Todo text" },
            priority: { type: "string", description: "Priority (low, medium, high)", default: "medium" },
          },
          required: ["text"],
        },
      },
      {
        name: "list_todos",
        description: "List all todos.",
        inputSchema: {
          type: "object",
          properties: {},
        },
      },
      {
        name: "complete_todo",
        description: "Mark a todo as completed.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "Todo ID" },
          },
          required: ["id"],
        },
      },
      {
        name: "delete_todo",
        description: "Delete a todo.",
        inputSchema: {
          type: "object",
          properties: {
            id: { type: "number", description: "Todo ID" },
          },
          required: ["id"],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const args = request.params.arguments ?? {};
  let result: unknown;

  switch (request.params.name) {
    case "scan_project":
      result = await scanProject(String(args.path), Number(args.depth ?? 5));
      break;
    case "get_project_summary":
      result = await getProjectSummary(String(args.path));
      break;
    case "explain_architecture":
      result = await explainArchitecture(String(args.path));
      break;
    case "remember":
      result = remember(
        String(args.key),
        String(args.content),
        (args.tags as string[]) ?? []
      );
      break;
    case "recall":
      result = recall(String(args.query), Number(args.limit ?? 10));
      break;
    case "list_memories":
      result = listMemories(args.tag as string | undefined);
      break;
    case "deduplicate_memories":
      result = await deduplicateMemories();
      break;
    case "summarize_memory":
      result = await summarizeMemory(String(args.key));
      break;
    case "find_related_memories":
      result = await findRelatedMemories(String(args.key), Number(args.threshold ?? 0.3));
      break;
    case "export_memories":
      result = await exportMemories();
      break;
    case "import_memories":
      result = await importMemories(String(args.backupPath));
      break;
    case "run_command":
      result = await runCommand(
        String(args.command),
        args.cwd as string | undefined,
        args.shell as string | undefined,
        Number(args.timeout ?? 30000)
      );
      break;
    case "git_status":
      result = await gitStatus(args.repoPath as string | undefined);
      break;
    case "git_log":
      result = await gitLog(
        args.repoPath as string | undefined,
        Number(args.count ?? 10)
      );
      break;
    case "git_diff":
      result = await gitDiff(
        args.repoPath as string | undefined,
        args.target as string | undefined
      );
      break;
    case "search_code":
      result = await searchCode(
        String(args.query),
        args.path as string | undefined,
        Boolean(args.literal ?? false),
        Number(args.maxResults ?? 50),
        args.ext as string | undefined,
        Boolean(args.caseSensitive ?? false),
        Number(args.contextLines ?? 2)
      );
      break;
    case "get_file_context":
      result = await getFileContext(
        String(args.filePath),
        Number(args.startLine ?? 1),
        args.endLine as number | undefined
      );
      break;
    case "read_file":
      result = await readFile(String(args.filePath));
      break;
    case "write_file":
      result = await writeFile(String(args.filePath), String(args.content));
      break;
    case "edit_file":
      result = await editFile(String(args.filePath), String(args.oldString), String(args.newString));
      break;
    case "delete_file":
      result = await deleteFile(String(args.filePath));
      break;
    case "list_directory":
      result = await listDirectory(String(args.path ?? "."), Number(args.depth ?? 1));
      break;
    case "http_request":
      result = await httpRequest({
        url: String(args.url),
        method: String(args.method ?? "GET"),
        headers: (args.headers as Record<string, string>) ?? {},
        body: args.body as string | undefined,
        timeout: Number(args.timeout ?? 30000),
      });
      break;
    case "list_processes":
      result = await listProcesses();
      break;
    case "kill_process":
      result = await killProcess(String(args.pid));
      break;
    case "get_system_info":
      result = getSystemInfo();
      break;
    case "check_port":
      result = await checkPort(Number(args.port), String(args.host ?? "127.0.0.1"));
      break;
    case "get_env_file":
      result = await getEnvFile(String(args.filePath ?? ".env"));
      break;
    case "get_code_stats":
      result = await getCodeStats(String(args.path ?? "."));
      break;
    case "generate_commit_message":
      result = await generateCommitMessage(args.repoPath as string | undefined);
      break;
    case "git_add":
      result = await gitAdd(args.files as string[], args.repoPath as string | undefined);
      break;
    case "git_commit":
      result = await gitCommit(String(args.message), args.repoPath as string | undefined);
      break;
    case "git_branches":
      result = await gitBranches(args.repoPath as string | undefined);
      break;
    case "git_checkout":
      result = await gitCheckout(String(args.branch), Boolean(args.create ?? false), args.repoPath as string | undefined);
      break;
    case "git_stash":
      result = await gitStash(args.message as string | undefined, args.repoPath as string | undefined);
      break;
    case "git_stash_pop":
      result = await gitStashPop(Number(args.index ?? 0), args.repoPath as string | undefined);
      break;
    case "git_stash_list":
      result = await gitStashList(args.repoPath as string | undefined);
      break;
    case "git_unstage":
      result = await gitUnstage(args.files as string[], args.repoPath as string | undefined);
      break;
    case "git_restore":
      result = await gitRestore(args.files as string[], args.repoPath as string | undefined);
      break;
    case "git_push":
      result = await gitPush(args.remote as string | undefined, args.branch as string | undefined, Boolean(args.force ?? false), args.repoPath as string | undefined);
      break;
    case "git_pull":
      result = await gitPull(args.remote as string | undefined, args.branch as string | undefined, args.repoPath as string | undefined);
      break;
    case "git_remote":
      result = await gitRemote(args.repoPath as string | undefined);
      break;
    case "git_merge":
      result = await gitMerge(String(args.branch), Boolean(args.noFastForward ?? false), args.repoPath as string | undefined);
      break;
    case "git_rebase":
      result = await gitRebase(String(args.branch), args.repoPath as string | undefined);
      break;
    case "git_tags":
      result = await gitTags(args.repoPath as string | undefined);
      break;
    case "git_create_tag":
      result = await gitCreateTag(String(args.name), args.message as string | undefined, args.repoPath as string | undefined);
      break;
    case "git_blame":
      result = await gitBlame(String(args.filePath), args.startLine as number | undefined, args.endLine as number | undefined, args.repoPath as string | undefined);
      break;
    case "git_show":
      result = await gitShow(String(args.commit), args.repoPath as string | undefined);
      break;
    case "analyze_branch_health":
      result = await analyzeBranchHealth(args.repoPath as string | undefined);
      break;
    case "analyze_workflow":
      result = await analyzeWorkflow(args.repoPath as string | undefined);
      break;
    case "score_commit_quality":
      result = await scoreCommitQuality(args.repoPath as string | undefined, Number(args.limit ?? 10));
      break;
    case "detect_conflicts":
      result = await detectConflicts(args.repoPath as string | undefined);
      break;
    case "get_git_config":
      result = await getGitConfig(args.repoPath as string | undefined);
      break;
    case "get_package_scripts":
      result = await getPackageScripts(args.path as string | undefined);
      break;
    case "run_package_script":
      result = await runPackageScript(String(args.script), args.path as string | undefined);
      break;
    case "generate_uuid":
      result = generateUUID();
      break;
    case "hash_text":
      result = hashText(String(args.text), String(args.algorithm ?? "sha256"));
      break;
    case "base64_encode":
      result = base64Encode(String(args.text));
      break;
    case "base64_decode":
      result = base64Decode(String(args.text));
      break;
    case "url_encode":
      result = urlEncode(String(args.text));
      break;
    case "url_decode":
      result = urlDecode(String(args.text));
      break;
    case "format_json":
      result = formatJson(String(args.text));
      break;
    case "get_current_time":
      result = getCurrentTime(args.timezone as string | undefined);
      break;
    case "convert_time":
      result = convertTime(String(args.time), String(args.sourceTimezone), String(args.targetTimezone));
      break;
    case "think":
      result = await think(
        String(args.thought),
        Number(args.thoughtNumber),
        Number(args.totalThoughts),
        Boolean(args.nextThoughtNeeded ?? true),
        Boolean(args.isRevision ?? false),
        args.revisesThought as number | undefined,
        args.branchFromThought as number | undefined,
        args.branchId as string | undefined
      );
      break;
    case "get_thoughts":
      result = await getThoughts(args.filter as string | undefined);
      break;
    case "clear_thinking":
      result = await clearThinking();
      break;
    case "db_set":
      result = await dbSet(String(args.store), String(args.key), String(args.value));
      break;
    case "db_get":
      result = await dbGet(String(args.store), String(args.key));
      break;
    case "db_delete":
      result = await dbDelete(String(args.store), String(args.key));
      break;
    case "db_list":
      result = await dbList(String(args.store), args.prefix as string | undefined);
      break;
    case "db_query":
      result = await dbQuery(String(args.store), String(args.query));
      break;
    case "fetch_text":
      result = await fetchText(String(args.url), Number(args.timeout ?? 30000));
      break;
    case "fetch_json":
      result = await fetchJson(String(args.url), Number(args.timeout ?? 30000));
      break;
    case "get_file_info":
      result = await getFileInfo(String(args.filePath));
      break;
    case "directory_tree":
      result = await directoryTree(String(args.path ?? "."), Number(args.depth ?? 3));
      break;
    case "move_file":
      result = await moveFile(String(args.source), String(args.destination));
      break;
    case "copy_file":
      result = await copyFile(String(args.source), String(args.destination));
      break;
    case "create_directory":
      result = await createDirectory(String(args.path));
      break;
    case "remove_directory":
      result = await removeDirectory(String(args.path), Boolean(args.recursive ?? false));
      break;
    case "diff_text":
      result = diffText(String(args.text1), String(args.text2), Number(args.contextLines ?? 3));
      break;
    case "regex_test":
      result = regexTest(String(args.pattern), String(args.text), String(args.flags ?? ""));
      break;
    case "generate_password":
      result = generatePassword(
        Number(args.length ?? 16),
        {
          uppercase: Boolean(args.includeUppercase ?? true),
          lowercase: Boolean(args.includeLowercase ?? true),
          numbers: Boolean(args.includeNumbers ?? true),
          symbols: Boolean(args.includeSymbols ?? true),
        }
      );
      break;
    case "jwt_decode":
      result = jwtDecode(String(args.token));
      break;
    case "analyze_text":
      result = analyzeText(String(args.text));
      break;
    case "convert_color":
      result = convertColor(String(args.color));
      break;
    case "evaluate_math":
      result = evaluateMath(String(args.expression));
      break;
    case "create_todo":
      result = await createTodo(String(args.text), (args.priority as "low" | "medium" | "high" | undefined) ?? "medium");
      break;
    case "list_todos":
      result = await listTodos();
      break;
    case "complete_todo":
      result = await completeTodo(String(args.id));
      break;
    case "delete_todo":
      result = await deleteTodo(String(args.id));
      break;
    default:
      throw new Error(`Unknown tool: ${request.params.name}`);
  }

  return {
    content: [
      {
        type: "text",
        text:
          typeof result === "string" ? result : JSON.stringify(result, null, 2),
      } as TextContent,
    ],
  };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
