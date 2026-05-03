#!/usr/bin/env node
import { scanProject, getProjectSummary, explainArchitecture } from "./scanner.js";
import { runCommand } from "./terminal.js";
import { searchCode, getFileContext } from "./search.js";

const args = process.argv.slice(2);
const command = args[0];

async function help() {
  console.log(`mcp-devkit CLI

Usage:
  mcp-devkit scan <path>           Scan a project and print tech stack
  mcp-devkit summary <path>        Print a human-readable project summary
  mcp-devkit architecture <path>   Print architecture overview
  mcp-devkit search <query> [path] Search code (default: current dir)
  mcp-devkit read <file> [start] [end]  Read a file (optionally with line range)
  mcp-devkit run <command>         Run a shell command
  mcp-devkit help                  Show this message
`);
}

async function main() {
  switch (command) {
    case "scan": {
      const path = args[1] || ".";
      const result = await scanProject(path);
      console.log(JSON.stringify(result.techStack, null, 2));
      break;
    }
    case "summary": {
      const path = args[1] || ".";
      const summary = await getProjectSummary(path);
      console.log(summary);
      break;
    }
    case "architecture": {
      const path = args[1] || ".";
      const arch = await explainArchitecture(path);
      console.log(arch);
      break;
    }
    case "search": {
      const query = args[1];
      const path = args[2] || ".";
      if (!query) {
        console.error("Usage: mcp-devkit search <query> [path]");
        process.exit(1);
      }
      const result = await searchCode(query, path);
      console.log(result);
      break;
    }
    case "read": {
      const file = args[1];
      const start = args[2] ? parseInt(args[2]) : 1;
      const end = args[3] ? parseInt(args[3]) : undefined;
      if (!file) {
        console.error("Usage: mcp-devkit read <file> [startLine] [endLine]");
        process.exit(1);
      }
      const result = await getFileContext(file, start, end);
      console.log(result);
      break;
    }
    case "run": {
      const cmd = args.slice(1).join(" ");
      if (!cmd) {
        console.error("Usage: mcp-devkit run <command>");
        process.exit(1);
      }
      const result = await runCommand(cmd);
      console.log(result);
      break;
    }
    case "help":
    default:
      await help();
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
