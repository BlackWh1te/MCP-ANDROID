import { promises as fs, constants } from "fs";
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

export async function scanProject(projectPath: string, maxDepth = 5): Promise<ScanResult> {
  const root = path.resolve(projectPath);
  const structure: FileInfo[] = [];
  let fileCount = 0;
  let dirCount = 0;
  const topLevelFiles: string[] = [];
  const contentMap = new Map<string, string>();

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

  return {
    root,
    fileCount,
    dirCount,
    techStack: { languages, frameworks, entryPoints, testFrameworks, buildTools },
    topLevelFiles,
    structure: structure.slice(0, 500), // limit
  };
}

export async function getProjectSummary(projectPath: string): Promise<string> {
  const scan = await scanProject(projectPath, 3);
  const ts = scan.techStack;
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
  lines.push(`Top-level files/directories: ${scan.topLevelFiles.join(", ")}`);
  return lines.join("\n");
}

export async function explainArchitecture(projectPath: string): Promise<string> {
  const scan = await scanProject(projectPath, 4);
  const ts = scan.techStack;
  const lines: string[] = [];
  lines.push(`# Architecture Overview`);
  lines.push(`Project: ${path.basename(scan.root)}`);
  lines.push(``);

  if (ts.frameworks.includes("Next.js") || ts.frameworks.includes("React")) {
    lines.push(`## Web Frontend (React/Next.js)`);
    lines.push(`- Likely uses a component-based architecture.`);
    lines.push(`- Entry point: ${ts.entryPoints.join(", ") || "src/ or pages/"}`);
    lines.push(`- Check src/components, src/app, or pages/ for UI structure.`);
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

  if (ts.buildTools.includes("Docker")) {
    lines.push(`## Deployment`);
    lines.push(`- Docker support detected. Check Dockerfile and docker-compose for orchestration.`);
  }

  if (ts.testFrameworks.length) {
    lines.push(`## Testing`);
    lines.push(`- Tests run with: ${ts.testFrameworks.join(", ")}`);
  }

  lines.push(``);
  lines.push(`## Key Files`);
  const keyFiles = scan.topLevelFiles
    .filter((f) => f.endsWith(".json") || f.endsWith(".toml") || f.endsWith(".yaml") || f.endsWith(".yml") || f.endsWith(".md"))
    .slice(0, 10);
  for (const f of keyFiles) lines.push(`- ${f}`);

  return lines.join("\n");
}
