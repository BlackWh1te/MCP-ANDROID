// BlackWhite — MCP DevKit
import { promises as fs, constants } from "fs";
import fsSync from "fs";
import path from "path";

interface FileInfo {
  name: string;
  path: string;
  type: "file" | "directory";
  size?: number;
}

interface TechStack {
  languages: string[];
  frameworks: string[];
  packageManager?: string;
  entryPoints: string[];
  testFrameworks: string[];
  buildTools: string[];
}

interface ScanResult {
  root: string;
  fileCount: number;
  dirCount: number;
  techStack: TechStack;
  topLevelFiles: string[];
  structure: FileInfo[];
  codeQuality: CodeQualityMetrics;
  securityIssues: SecurityIssue[];
  patterns: PatternDetection;
  dependencies: DependencyAnalysis;
}

interface CodeQualityMetrics {
  avgFunctionLength: number;
  maxNestingDepth: number;
  complexityScore: number;
  duplicateCodeRatio: number;
  todoCount: number;
  fixmeCount: number;
  hackCount: number;
}

interface SecurityIssue {
  severity: "critical" | "high" | "medium" | "low";
  type: string;
  file: string;
  line?: number;
  description: string;
}

interface PatternDetection {
  designPatterns: string[];
  antiPatterns: string[];
  architecturePatterns: string[];
  codeSmells: string[];
}

interface DependencyAnalysis {
  totalDependencies: number;
  outdatedDependencies: string[];
  vulnerableDependencies: string[];
  dependencyTree: Record<string, string[]>;
}

const DETECTORS: Record<string, (files: string[]) => string[]> = {
  NodeJS: (files) => {
    const out: string[] = [];
    if (files.includes("package.json")) out.push("Node.js");
    if (files.includes("package-lock.json")) out.push("npm");
    if (files.includes("yarn.lock")) out.push("Yarn");
    if (files.includes("pnpm-lock.yaml")) out.push("pnpm");
    if (files.includes("bun.lockb") || files.includes("bun.lock")) out.push("Bun");
    return out;
  },
  Python: (files) => {
    const out: string[] = [];
    if (files.includes("requirements.txt") || files.includes("pyproject.toml") || files.includes("setup.py"))
      out.push("Python");
    if (files.includes("poetry.lock")) out.push("Poetry");
    if (files.includes("Pipfile")) out.push("Pipenv");
    return out;
  },
  Rust: (files) => {
    return files.includes("Cargo.toml") ? ["Rust", "Cargo"] : [];
  },
  Go: (files) => {
    return files.includes("go.mod") ? ["Go", "Go Modules"] : [];
  },
  Java: (files) => {
    const out: string[] = [];
    if (files.includes("pom.xml")) out.push("Java", "Maven");
    if (files.includes("build.gradle") || files.includes("build.gradle.kts"))
      out.push("Java", "Gradle");
    return out;
  },
  DotNet: (files) => {
    return files.some((f) => f.endsWith(".csproj") || f.endsWith(".sln"))
      ? [".NET"]
      : [];
  },
  Ruby: (files) => {
    return files.includes("Gemfile") ? ["Ruby", "Bundler"] : [];
  },
  PHP: (files) => {
    return files.includes("composer.json") ? ["PHP", "Composer"] : [];
  },
  Docker: (files) => {
    return files.some((f) => f.startsWith("Dockerfile") || f.includes("docker-compose"))
      ? ["Docker"]
      : [];
  },
  CI: (files) => {
    const out: string[] = [];
    if (files.includes(".github")) out.push("GitHub Actions");
    if (files.some((f) => f.startsWith(".gitlab-ci"))) out.push("GitLab CI");
    if (files.includes("azure-pipelines.yml")) out.push("Azure Pipelines");
    if (files.includes("Jenkinsfile")) out.push("Jenkins");
    return out;
  },
};

const FRAMEWORK_DETECTOR: Record<string, (files: string[], contentMap: Map<string, string>) => string[]> = {
  React: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && (pkg.includes("react") || pkg.includes("next"))) return ["React"];
    return [];
  },
  NextJS: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("next")) return ["Next.js"];
    return [];
  },
  Vue: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("vue")) return ["Vue.js"];
    return [];
  },
  Angular: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("@angular")) return ["Angular"];
    return [];
  },
  Django: (files) => (files.some((f) => f.includes("manage.py")) ? ["Django"] : []),
  Flask: (_f, contentMap) => {
    const req = contentMap.get("requirements.txt");
    if (req && req.includes("flask")) return ["Flask"];
    return [];
  },
  FastAPI: (_f, contentMap) => {
    const req = contentMap.get("requirements.txt");
    if (req && req.includes("fastapi")) return ["FastAPI"];
    return [];
  },
  Express: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("express")) return ["Express"];
    return [];
  },
  NestJS: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("@nestjs")) return ["NestJS"];
    return [];
  },
  Svelte: (files) => (files.includes("svelte.config.js") ? ["Svelte"] : []),
  SvelteKit: (files) =>
    files.includes("svelte.config.js") && files.includes("src/routes")
      ? ["SvelteKit"]
      : [],
  Remix: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("remix")) return ["Remix"];
    return [];
  },
  Astro: (files) => (files.includes("astro.config.mjs") || files.includes("astro.config.ts") ? ["Astro"] : []),
  Gatsby: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("gatsby")) return ["Gatsby"];
    return [];
  },
  Vite: (files, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("vite")) return ["Vite"];
    if (files.includes("vite.config.ts") || files.includes("vite.config.js") || files.includes("vite.config.mjs")) return ["Vite"];
    return [];
  },
  Electron: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("electron")) return ["Electron"];
    return [];
  },
  SolidJS: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("solid-js")) return ["SolidJS"];
    return [];
  },
  Preact: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("preact")) return ["Preact"];
    return [];
  },
  Laravel: (files) => (files.includes("artisan") ? ["Laravel"] : []),
  Rails: (files) => (files.includes("Gemfile") && files.includes("config/routes.rb") ? ["Ruby on Rails"] : []),
  Nuxt: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("nuxt")) return ["Nuxt"];
    return [];
  },
  Tailwind: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("tailwindcss")) return ["Tailwind CSS"];
    return [];
  },
  Tauri: (files) =>
    files.includes("tauri.conf.json") || files.includes("src-tauri/Cargo.toml")
      ? ["Tauri"]
      : [],
  Capacitor: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("@capacitor")) return ["Capacitor"];
    return [];
  },
  Ionic: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("@ionic")) return ["Ionic"];
    return [];
  },
  Flutter: (files) =>
    files.includes("pubspec.yaml") && files.includes("lib/main.dart")
      ? ["Flutter"]
      : [],
  Dart: (files) =>
    files.includes("pubspec.yaml") ? ["Dart"] : [],
  Kotlin: (files) =>
    files.some((f) => f.endsWith(".kt") || f.endsWith(".kts")) ? ["Kotlin"] : [],
  Swift: (files) =>
    files.some((f) => f.endsWith(".swift")) ? ["Swift"] : [],
  Unity: (files) =>
    files.some((f) => f.includes("Unity") && f.endsWith(".cs")) ? ["Unity"] : [],
  Unreal: (files) =>
    files.some((f) => f.endsWith(".uproject")) ? ["Unreal Engine"] : [],
  Godot: (files) =>
    files.some((f) => f.endsWith(".godot") || f.endsWith(".tscn")) ? ["Godot"] : [],
  Bevy: (_f, contentMap) => {
    const cargo = contentMap.get("Cargo.toml");
    if (cargo && cargo.includes("bevy")) return ["Bevy"];
    return [];
  },
  Axum: (_f, contentMap) => {
    const cargo = contentMap.get("Cargo.toml");
    if (cargo && cargo.includes("axum")) return ["Axum"];
    return [];
  },
  Actix: (_f, contentMap) => {
    const cargo = contentMap.get("Cargo.toml");
    if (cargo && cargo.includes("actix")) return ["Actix"];
    return [];
  },
  Rocket: (_f, contentMap) => {
    const cargo = contentMap.get("Cargo.toml");
    if (cargo && cargo.includes("rocket")) return ["Rocket"];
    return [];
  },
  Fiber: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("fiber")) return ["Fiber"];
    return [];
  },
  Gin: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("gin")) return ["Gin"];
    return [];
  },
  Echo: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("echo")) return ["Echo"];
    return [];
  },
  Chi: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("chi")) return ["Chi"];
    return [];
  },
  Zustand: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("zustand")) return ["Zustand"];
    return [];
  },
  Redux: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("redux")) return ["Redux"];
    return [];
  },
  Jotai: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("jotai")) return ["Jotai"];
    return [];
  },
  Pinia: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("pinia")) return ["Pinia"];
    return [];
  },
  Prisma: (files) =>
    files.includes("prisma/schema.prisma") ? ["Prisma"] : [],
  Drizzle: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("drizzle")) return ["Drizzle ORM"];
    return [];
  },
  Sequelize: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("sequelize")) return ["Sequelize"];
    return [];
  },
  TypeORM: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("typeorm")) return ["TypeORM"];
    return [];
  },
  Mongoose: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("mongoose")) return ["Mongoose"];
    return [];
  },
  MongoDB: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("mongodb")) return ["MongoDB"];
    return [];
  },
  Firebase: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("firebase")) return ["Firebase"];
    return [];
  },
  Supabase: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("supabase")) return ["Supabase"];
    return [];
  },
  GraphQL: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && (pkg.includes("graphql") || pkg.includes("apollo"))) return ["GraphQL"];
    return [];
  },
  tRPC: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("trpc")) return ["tRPC"];
    return [];
  },
  SocketIO: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("socket.io")) return ["Socket.IO"];
    return [];
  },
  WebSocket: (_f, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && pkg.includes("ws")) return ["WebSocket"];
    return [];
  },
  Vercel: (files, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && (pkg.includes("vercel") || files.includes("vercel.json"))) return ["Vercel"];
    return [];
  },
  Netlify: (files) =>
    files.includes("netlify.toml") ? ["Netlify"] : [],
  Cloudflare: (files, contentMap) => {
    const pkg = contentMap.get("package.json");
    if (pkg && (pkg.includes("wrangler") || files.includes("wrangler.toml"))) return ["Cloudflare Workers"];
    return [];
  },
  Terraform: (files) =>
    files.some((f) => f.endsWith(".tf")) ? ["Terraform"] : [],
  Kubernetes: (files) =>
    files.some((f) => f.endsWith(".yaml") && f.includes("k8s")) || files.includes("deployment.yaml")
      ? ["Kubernetes"]
      : [],
  Ansible: (files) =>
    files.some((f) => f.includes("playbook") && f.endsWith(".yml")) ? ["Ansible"] : [],
  Pulumi: (files) =>
    files.includes("Pulumi.yaml") ? ["Pulumi"] : [],
};

async function canRead(p: string): Promise<boolean> {
  try {
    await fs.access(p, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function readDirSafe(p: string): Promise<string[]> {
  try {
    return await fs.readdir(p);
  } catch {
    return [];
  }
}

async function readFileSafe(p: string, maxBytes = 50000): Promise<string> {
  try {
    const data = await fs.readFile(p, "utf-8");
    return data.slice(0, maxBytes);
  } catch {
    return "";
  }
}

// Advanced code quality analysis
async function analyzeCodeQuality(files: string[], root: string): Promise<CodeQualityMetrics> {
  let totalFunctionLength = 0;
  let functionCount = 0;
  let maxNesting = 0;
  let complexitySum = 0;
  let fileCount = 0;
  let todoCount = 0;
  let fixmeCount = 0;
  let hackCount = 0;

  for (const file of files) {
    if (!file.match(/\.(js|ts|jsx|tsx|py|rs|go|java|cs|cpp|c|h|php|rb)$/)) continue;
    const content = await readFileSafe(file, 100000);
    if (!content) continue;

    fileCount++;

    // Count TODO, FIXME, HACK comments
    todoCount += (content.match(/TODO|todo/g) || []).length;
    fixmeCount += (content.match(/FIXME|fixme/g) || []).length;
    hackCount += (content.match(/HACK|hack/g) || []).length;

    // Analyze function length and nesting
    const lines = content.split("\n");
    let currentNesting = 0;
    let inFunction = false;
    let functionStart = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const openBraces = (line.match(/{/g) || []).length;
      const closeBraces = (line.match(/}/g) || []).length;
      currentNesting += openBraces - closeBraces;
      maxNesting = Math.max(maxNesting, currentNesting);

      // Detect function start (simplified)
      if (line.match(/function|def|fn|func|=>/)) {
        inFunction = true;
        functionStart = i;
      }

      if (inFunction && closeBraces > 0 && currentNesting === 0) {
        const funcLength = i - functionStart;
        totalFunctionLength += funcLength;
        functionCount++;
        inFunction = false;
      }
    }

    // Simple complexity estimation
    const complexity = content.split(/\bif\b|\bfor\b|\bwhile\b|\bcase\b|\bcatch\b/).length - 1;
    complexitySum += complexity;
  }

  return {
    avgFunctionLength: functionCount > 0 ? Math.round(totalFunctionLength / functionCount) : 0,
    maxNestingDepth: maxNesting,
    complexityScore: fileCount > 0 ? Math.round(complexitySum / fileCount) : 0,
    duplicateCodeRatio: 0, // Would need more sophisticated analysis
    todoCount,
    fixmeCount,
    hackCount,
  };
}

// Security vulnerability detection
async function detectSecurityIssues(files: string[], root: string, contentMap: Map<string, string>): Promise<SecurityIssue[]> {
  const issues: SecurityIssue[] = [];

  // Check package.json for vulnerable dependencies
  const pkg = contentMap.get("package.json");
  if (pkg) {
    try {
      const pkgData = JSON.parse(pkg);
      const deps = { ...pkgData.dependencies, ...pkgData.devDependencies };

      // Known vulnerable packages (simplified check)
      const knownVulns: Record<string, string> = {
        "lodash": "<4.17.21",
        "axios": "<0.21.1",
        "moment": "<2.29.4",
        "express": "<4.17.2",
      };

      for (const [dep, version] of Object.entries(deps)) {
        if (knownVulns[dep]) {
          issues.push({
            severity: "high",
            type: "vulnerable_dependency",
            file: "package.json",
            description: `${dep}@${version} has known vulnerabilities. Update to ${knownVulns[dep]}`,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  // Scan source files for security issues
  for (const file of files) {
    if (!file.match(/\.(js|ts|jsx|tsx|py|php|rb)$/)) continue;
    const content = await readFileSafe(file, 100000);
    if (!content) continue;

    const lines = content.split("\n");

    // Detect hardcoded secrets
    const secretPatterns = [
      { pattern: /api[_-]?key\s*[:=]\s*['"][\w-]{20,}['"]/i, type: "hardcoded_api_key", severity: "critical" },
      { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/i, type: "hardcoded_password", severity: "critical" },
      { pattern: /secret\s*[:=]\s*['"][\w-]{20,}['"]/i, type: "hardcoded_secret", severity: "critical" },
      { pattern: /token\s*[:=]\s*['"][\w-]{20,}['"]/i, type: "hardcoded_token", severity: "high" },
    ];

    for (const { pattern, type, severity } of secretPatterns) {
      for (let i = 0; i < lines.length; i++) {
        if (pattern.test(lines[i])) {
          issues.push({
            severity: severity as "critical" | "high" | "medium" | "low",
            type,
            file: path.relative(root, file),
            line: i + 1,
            description: `Potential ${type} detected`,
          });
        }
      }
    }

    // Detect eval usage (security risk)
    if (content.match(/\beval\s*\(/)) {
      issues.push({
        severity: "medium",
        type: "eval_usage",
        file: path.relative(root, file),
        description: "Use of eval() detected, which is a security risk",
      });
    }

    // Detect SQL injection patterns
    if (content.match(/["'].*\+\s*\w+\s*\+.*["']/) && content.match(/SELECT|INSERT|UPDATE|DELETE/i)) {
      issues.push({
        severity: "high",
        type: "sql_injection_risk",
        file: path.relative(root, file),
        description: "Potential SQL injection vulnerability (string concatenation in SQL)",
      });
    }
  }

  return issues;
}

// Pattern detection
async function detectPatterns(files: string[], root: string, contentMap: Map<string, string>): Promise<PatternDetection> {
  const designPatterns: string[] = [];
  const antiPatterns: string[] = [];
  const architecturePatterns: string[] = [];
  const codeSmells: string[] = [];

  for (const file of files) {
    if (!file.match(/\.(js|ts|jsx|tsx|py|java|cs|php|rb)$/)) continue;
    const content = await readFileSafe(file, 100000);
    if (!content) continue;

    // Detect design patterns (simplified)
    if (content.match(/class\s+\w+\s*{/)) {
      if (content.match(/static\s+instance\b/) || content.match(/getInstance\s*\(/)) {
        designPatterns.push("Singleton");
      }
      if (content.match(/interface\s+\w+/) && content.match(/implements\s+\w+/)) {
        designPatterns.push("Strategy");
      }
    }

    // Detect architecture patterns
    if (content.match(/controller|Controller/)) architecturePatterns.push("MVC");
    if (content.match(/service|Service/) && content.match(/repository|Repository/)) {
      architecturePatterns.push("Layered Architecture");
    }
    if (content.match(/store|Store|reducer|Reducer/)) architecturePatterns.push("Redux/Flux");
    if (content.match(/context|Context|provider|Provider/)) architecturePatterns.push("Context Pattern");

    // Detect code smells
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.length > 200) codeSmells.push("Long Line");
      if (line.match(/console\.log/)) codeSmells.push("Debug Code");
      if (line.match(/any\b/) && file.match(/\.(ts|tsx)$/)) codeSmells.push("Type: any");
    }
  }

  // Detect anti-patterns from structure
  const hasDeepNesting = files.some((f) => f.split(/[\\/]/).length > 8);
  if (hasDeepNesting) antiPatterns.push("Deep Nesting");

  const hasLargeFiles = files.some((f) => {
    try {
      return fsSync.statSync(f).size > 500_000;
    } catch {
      return false;
    }
  });
  if (hasLargeFiles) antiPatterns.push("Large Files");

  return {
    designPatterns: [...new Set(designPatterns)],
    antiPatterns: [...new Set(antiPatterns)],
    architecturePatterns: [...new Set(architecturePatterns)],
    codeSmells: [...new Set(codeSmells)],
  };
}

// Dependency analysis
async function analyzeDependencies(contentMap: Map<string, string>, root: string): Promise<DependencyAnalysis> {
  const pkg = contentMap.get("package.json");
  if (!pkg) {
    return { totalDependencies: 0, outdatedDependencies: [], vulnerableDependencies: [], dependencyTree: {} };
  }

  try {
    const pkgData = JSON.parse(pkg);
    const deps = { ...pkgData.dependencies, ...pkgData.devDependencies };
    const depNames = Object.keys(deps);

    // Build simple dependency tree
    const dependencyTree: Record<string, string[]> = {};
    for (const dep of depNames) {
      dependencyTree[dep] = []; // Would need package-lock.json for full tree
    }

    // Check for outdated (simplified - would need npm outdated)
    const outdated: string[] = [];
    const vulnerable: string[] = [];

    // Known outdated packages (simplified)
    const outdatedPackages = ["react", "vue", "angular", "express", "lodash"];
    for (const dep of depNames) {
      if (outdatedPackages.includes(dep)) {
        outdated.push(dep);
      }
    }

    return {
      totalDependencies: depNames.length,
      outdatedDependencies: outdated,
      vulnerableDependencies: vulnerable,
      dependencyTree,
    };
  } catch {
    return { totalDependencies: 0, outdatedDependencies: [], vulnerableDependencies: [], dependencyTree: {} };
  }
}

export async function scanProject(projectPath: string, maxDepth = 5): Promise<ScanResult> {
  const root = path.resolve(projectPath);
  const structure: FileInfo[] = [];
  let fileCount = 0;
  let dirCount = 0;
  const topLevelFiles: string[] = [];
  const contentMap = new Map<string, string>();
  const allFiles: string[] = [];

  async function walk(dir: string, depth: number) {
    if (depth > maxDepth) return;
    if (!canRead(dir)) return;
    const entries = await readDirSafe(dir);
    for (const name of entries) {
      if (name === ".git" || name === "node_modules" || name === "vendor" || name === "__pycache__" || name === ".next" || name === "dist" || name === "build" || name === "target" || name === ".cargo") {
        continue;
      }
      const full = path.join(dir, name);
      try {
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          dirCount++;
          structure.push({ name, path: full, type: "directory" });
          await walk(full, depth + 1);
        } else {
          fileCount++;
          structure.push({ name, path: full, type: "file", size: stat.size });
          allFiles.push(full);
          if (depth === 0) topLevelFiles.push(name);
          if (name === "package.json" || name === "requirements.txt" || name === "Cargo.toml" || name === "go.mod" || name === "pyproject.toml") {
            contentMap.set(name, await readFileSafe(full));
          }
        }
      } catch {
        // ignore
      }
    }
  }

  await walk(root, 0);

  const languages: string[] = [];
  const frameworks: string[] = [];
  const entryPoints: string[] = [];
  const testFrameworks: string[] = [];
  const buildTools: string[] = [];

  for (const [_, detector] of Object.entries(DETECTORS)) {
    const detected = detector(topLevelFiles);
    for (const d of detected) {
      if (!languages.includes(d) && !frameworks.includes(d) && !buildTools.includes(d)) {
        if (["npm", "Yarn", "pnpm", "Bun", "Poetry", "Pipenv", "Cargo", "Go Modules", "Maven", "Gradle", "Bundler", "Composer"].includes(d)) {
          if (!buildTools.includes(d)) buildTools.push(d);
        } else {
          if (!languages.includes(d)) languages.push(d);
        }
      }
    }
  }

  for (const [_, detector] of Object.entries(FRAMEWORK_DETECTOR)) {
    const detected = detector(topLevelFiles, contentMap);
    for (const d of detected) {
      if (!frameworks.includes(d)) frameworks.push(d);
    }
  }

  // Guess entry points
  if (topLevelFiles.includes("package.json")) {
    try {
      const pkg = JSON.parse(contentMap.get("package.json") ?? "{}");
      if (pkg.main) entryPoints.push(pkg.main);
      if (pkg.module) entryPoints.push(pkg.module);
    } catch {
      // ignore
    }
  }
  if (topLevelFiles.includes("src")) entryPoints.push("src/");
  if (topLevelFiles.includes("main.py")) entryPoints.push("main.py");
  if (topLevelFiles.includes("main.rs")) entryPoints.push("src/main.rs");
  if (topLevelFiles.includes("main.go")) entryPoints.push("main.go");
  if (topLevelFiles.includes("index.js")) entryPoints.push("index.js");
  if (topLevelFiles.includes("index.ts")) entryPoints.push("index.ts");
  if (topLevelFiles.includes("App.tsx") || topLevelFiles.includes("App.jsx")) entryPoints.push("src/App.*");

  // Guess test frameworks
  if (topLevelFiles.includes("jest.config.js") || topLevelFiles.includes("jest.config.ts")) testFrameworks.push("Jest");
  if (topLevelFiles.includes("vitest.config.ts")) testFrameworks.push("Vitest");
  if (topLevelFiles.some((f) => f.includes("cypress"))) testFrameworks.push("Cypress");
  if (topLevelFiles.some((f) => f.includes("playwright"))) testFrameworks.push("Playwright");
  if (topLevelFiles.includes("pytest.ini") || topLevelFiles.includes("setup.cfg")) testFrameworks.push("pytest");
  if (topLevelFiles.includes("Cargo.toml") && contentMap.get("Cargo.toml")?.includes("[[test]]")) testFrameworks.push("Cargo test");

  // Advanced analysis
  const [codeQuality, securityIssues, patterns, dependencies] = await Promise.all([
    analyzeCodeQuality(allFiles, root),
    detectSecurityIssues(allFiles, root, contentMap),
    detectPatterns(allFiles, root, contentMap),
    analyzeDependencies(contentMap, root),
  ]);

  return {
    root,
    fileCount,
    dirCount,
    techStack: { languages, frameworks, entryPoints, testFrameworks, buildTools },
    topLevelFiles,
    structure: structure.slice(0, 500), // limit
    codeQuality,
    securityIssues,
    patterns,
    dependencies,
  };
}

export async function getProjectSummary(projectPath: string): Promise<string> {
  const scan = await scanProject(projectPath, 3);
  const ts = scan.techStack;
  const cq = scan.codeQuality;
  const sec = scan.securityIssues;
  const pat = scan.patterns;
  const deps = scan.dependencies;
  const lines: string[] = [];
  lines.push(`# Project Summary: ${path.basename(scan.root)}`);
  lines.push(`Path: ${scan.root}`);
  lines.push(`Files: ${scan.fileCount}, Directories: ${scan.dirCount}`);
  lines.push(``);
  if (ts.languages.length) lines.push(`Languages: ${ts.languages.join(", ")}`);
  if (ts.frameworks.length) lines.push(`Frameworks: ${ts.frameworks.join(", ")}`);
  if (ts.buildTools.length) lines.push(`Package/Build Tools: ${ts.buildTools.join(", ")}`);
  if (ts.entryPoints.length) lines.push(`Likely Entry Points: ${ts.entryPoints.join(", ")}`);
  if (ts.testFrameworks.length) lines.push(`Test Frameworks: ${ts.testFrameworks.join(", ")}`);
  lines.push(``);
  lines.push(`## Code Quality`);
  lines.push(`- Avg Function Length: ${cq.avgFunctionLength} lines`);
  lines.push(`- Max Nesting Depth: ${cq.maxNestingDepth}`);
  lines.push(`- Complexity Score: ${cq.complexityScore}`);
  lines.push(`- TODOs: ${cq.todoCount}, FIXMEs: ${cq.fixmeCount}, HACKs: ${cq.hackCount}`);
  lines.push(``);
  if (sec.length > 0) {
    lines.push(`## Security Issues (${sec.length})`);
    const critical = sec.filter(s => s.severity === "critical").length;
    const high = sec.filter(s => s.severity === "high").length;
    lines.push(`- Critical: ${critical}, High: ${high}, Medium: ${sec.filter(s => s.severity === "medium").length}, Low: ${sec.filter(s => s.severity === "low").length}`);
    for (const issue of sec.slice(0, 5)) {
      lines.push(`  - [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
    }
    if (sec.length > 5) lines.push(`  ... and ${sec.length - 5} more`);
    lines.push(``);
  }
  if (pat.designPatterns.length || pat.architecturePatterns.length) {
    lines.push(`## Detected Patterns`);
    if (pat.designPatterns.length) lines.push(`- Design Patterns: ${pat.designPatterns.join(", ")}`);
    if (pat.architecturePatterns.length) lines.push(`- Architecture Patterns: ${pat.architecturePatterns.join(", ")}`);
    if (pat.codeSmells.length) lines.push(`- Code Smells: ${[...new Set(pat.codeSmells)].join(", ")}`);
    lines.push(``);
  }
  if (deps.totalDependencies > 0) {
    lines.push(`## Dependencies`);
    lines.push(`- Total: ${deps.totalDependencies}`);
    if (deps.outdatedDependencies.length) lines.push(`- Potentially Outdated: ${deps.outdatedDependencies.join(", ")}`);
    if (deps.vulnerableDependencies.length) lines.push(`- Vulnerable: ${deps.vulnerableDependencies.join(", ")}`);
    lines.push(``);
  }
  lines.push(`Top-level files/directories: ${scan.topLevelFiles.join(", ")}`);
  return lines.join("\n");
}

export async function explainArchitecture(projectPath: string): Promise<string> {
  const scan = await scanProject(projectPath, 4);
  const ts = scan.techStack;
  const pat = scan.patterns;
  const cq = scan.codeQuality;
  const lines: string[] = [];
  lines.push(`# Architecture Overview`);
  lines.push(`Project: ${path.basename(scan.root)}`);
  lines.push(``);

  if (ts.frameworks.includes("Next.js") || ts.frameworks.includes("React")) {
    lines.push(`## Web Frontend (React/Next.js)`);
    lines.push(`- Likely uses a component-based architecture.`);
    lines.push(`- Entry point: ${ts.entryPoints.join(", ") || "src/ or pages/"}`);
    lines.push(`- Check src/components, src/app, or pages/ for UI structure.`);
    if (pat.architecturePatterns.includes("Redux/Flux")) {
      lines.push(`- State management: Redux/Flux pattern detected`);
    }
    if (pat.architecturePatterns.includes("Context Pattern")) {
      lines.push(`- State management: React Context pattern detected`);
    }
  } else if (ts.frameworks.includes("Vue.js")) {
    lines.push(`## Web Frontend (Vue.js)`);
    lines.push(`- Likely uses single-file components (.vue files).`);
    lines.push(`- Entry point: src/main.js or src/main.ts`);
  } else if (ts.frameworks.includes("Angular")) {
    lines.push(`## Web Frontend (Angular)`);
    lines.push(`- Module-based architecture with lazy loading likely in src/app.`);
  } else if (ts.languages.includes("Python")) {
    lines.push(`## Python Application`);
    lines.push(`- Likely organized with modules/packages in src/ or the root.`);
    if (ts.frameworks.includes("Django")) {
      lines.push(`- Django project: look for settings.py, urls.py, and apps/`);
    } else if (ts.frameworks.includes("Flask")) {
      lines.push(`- Flask app: look for app.py or factory pattern in src/`);
    } else if (ts.frameworks.includes("FastAPI")) {
      lines.push(`- FastAPI app: look for main.py with APIRouter structures.`);
    }
  } else if (ts.languages.includes("Rust")) {
    lines.push(`## Rust Application`);
    lines.push(`- Cargo workspace or single crate. Entry: src/main.rs or src/lib.rs.`);
  } else if (ts.languages.includes("Go")) {
    lines.push(`## Go Application`);
    lines.push(`- Likely uses standard Go project layout. Entry: main.go or cmd/.`);
  }

  if (pat.architecturePatterns.length) {
    lines.push(`## Architecture Patterns Detected`);
    for (const pattern of pat.architecturePatterns) {
      lines.push(`- ${pattern}`);
    }
  }

  if (pat.designPatterns.length) {
    lines.push(`## Design Patterns Detected`);
    for (const pattern of pat.designPatterns) {
      lines.push(`- ${pattern}`);
    }
  }

  if (ts.buildTools.includes("Docker")) {
    lines.push(`## Deployment`);
    lines.push(`- Docker support detected. Check Dockerfile and docker-compose for orchestration.`);
  }

  if (ts.testFrameworks.length) {
    lines.push(`## Testing`);
    lines.push(`- Tests run with: ${ts.testFrameworks.join(", ")}`);
  }

  lines.push(`## Code Quality Assessment`);
  lines.push(`- Average function length: ${cq.avgFunctionLength} lines`);
  lines.push(`- Maximum nesting depth: ${cq.maxNestingDepth}`);
  lines.push(`- Complexity score: ${cq.complexityScore} (lower is better)`);
  if (cq.todoCount > 0 || cq.fixmeCount > 0) {
    lines.push(`- Outstanding work: ${cq.todoCount} TODOs, ${cq.fixmeCount} FIXMEs`);
  }

  lines.push(``);
  lines.push(`## Key Files`);
  const keyFiles = scan.topLevelFiles
    .filter((f) => f.endsWith(".json") || f.endsWith(".toml") || f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".md"))
    .slice(0, 10);
  for (const f of keyFiles) lines.push(`- ${f}`);

  return lines.join("\n");
}
