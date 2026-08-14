/**
 * PerFileScaffolder — scaffolds a project directory using per-node files
 * from the FileGenerator instead of 3 monolithic layers.
 *
 * Each architecture node becomes its own standalone source file with
 * proper imports/exports, organized into a clean directory structure.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { OSType, LinuxDistro, Node, Edge } from '../types.js';
import { labelToFileName } from '../layers/fileGenerator.js';
import type { GeneratedFile } from '../layers/fileGenerator.js';

export interface PerFileScaffoldConfig {
  projectName: string;
  targetOS: OSType;
  linuxDistro?: LinuxDistro;
  /** Per-node files from FileGenerator */
  files: GeneratedFile[];
  nodes: Node[];
  edges: Edge[];
  appGoal?: string;
  appPurpose?: string;
  /** Custom output directory — if provided, scaffold here instead of default exports/ */
  outputDir?: string;
}

export interface ScaffoldResult {
  success: boolean;
  outputPath: string;
  files: string[];
  message: string;
  /** Set when a requested custom outputDir was unwritable and the scaffold fell back to exports/. */
  warning?: string;
  perNodeFiles: Array<{
    nodeId: string;
    nodeLabel: string;
    filePath: string;
    fileName: string;
    validated: boolean;
  }>;
}

const EXPORTS_DIR = path.resolve(process.cwd(), 'exports');

/** Escape a string for use inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export class PerFileScaffolder {
  /**
   * Scaffold a project using per-node files from the FileGenerator.
   * Each file is written to an organized directory structure.
   */
  async scaffold(config: PerFileScaffoldConfig): Promise<ScaffoldResult> {
    const sanitized = this.sanitizeName(config.projectName);
    const defaultDir = path.join(EXPORTS_DIR, `${sanitized}-perfile-${Date.now()}`);
    // Expand "~" / "~/..." to the user's home dir (matches validate-path).
    const rawDir = config.outputDir;
    const customDir = rawDir
      ? rawDir === '~'
        ? os.homedir()
        : rawDir.startsWith('~/')
          ? path.join(os.homedir(), rawDir.slice(2))
          : rawDir
      : undefined;
    let outputDir = customDir
      ? path.resolve(customDir, sanitized)
      : defaultDir;

    // A custom output path may be unwritable (e.g. EACCES on a root-owned dir
    // like /home/desktop, or ENOENT on a missing parent). Don't fail the whole
    // build with a bare 500 — fall back to the default exports/ dir and tell
    // the user so they know where their files actually landed.
    let warning: string | undefined;
    try {
      await fs.mkdir(outputDir, { recursive: true });
    } catch (err: any) {
      const reason = err?.code || err?.message || 'permission denied';
      console.warn(`[PerFileScaffolder] Custom output dir "${outputDir}" unwritable (${reason}) — falling back to ${defaultDir}`);
      outputDir = defaultDir;
      warning = `Custom output path "${config.outputDir}" could not be created (${reason}). Files were written to the default exports directory instead.`;
      await fs.mkdir(outputDir, { recursive: true });
    }

    const created: string[] = [];
    const perNodeFiles: ScaffoldResult['perNodeFiles'] = [];

    // ── Write per-node source files into src/ directory ──
    const srcDir = path.join(outputDir, 'src');
    await fs.mkdir(srcDir, { recursive: true });

    for (const file of config.files) {
      const nodeLabel = file.nodeLabel || 'unknown';
      const isPython = (file.language || '').toLowerCase() === 'python';
      
      // Directory name MUST match the import paths the generator emitted
      // (../<labelToFileName(dep)>/<file>.ts) — sanitizeName kept the label's
      // extension ('timer-input.ts' → 'timer-input-ts'), which broke every
      // cross-file import in exported projects (TS2307). labelToFileName
      // strips the extension first, matching buildImportStatement/runTscCheck.
      // Python can't import hyphenated directory names — use underscores.
      const safeName = isPython
        ? labelToFileName(nodeLabel).replace(/-/g, '_')
        : labelToFileName(nodeLabel);
      
      const nodeDir = path.join(srcDir, safeName);
      await fs.mkdir(nodeDir, { recursive: true });

      const filePath = path.join(nodeDir, file.fileName);
      await fs.writeFile(filePath, file.code, 'utf-8');

      // For Python, create an __init__.py that re-exports from the main file
      if (isPython) {
        const initContent = `from .${file.fileName.replace(/\.py$/, '')} import *  # Auto-generated: re-export all from this node
`;
        const initPath = path.join(nodeDir, '__init__.py');
        await fs.writeFile(initPath, initContent, 'utf-8');
        const initRelPath = `src/${safeName}/__init__.py`;
        created.push(initRelPath);
      }

      const relPath = `src/${safeName}/${file.fileName}`;
      created.push(relPath);
      perNodeFiles.push({
        nodeId: file.nodeId,
        nodeLabel: file.nodeLabel,
        filePath: relPath,
        fileName: file.fileName,
        validated: file.validated,
      });
    }

    // ── Write dependency graph metadata ──
    const graphData = {
      projectName: config.projectName,
      targetOS: config.targetOS,
      nodes: config.files.map(f => ({
        nodeId: f.nodeId,
        nodeLabel: f.nodeLabel,
        fileName: f.fileName,
        language: f.language,
        dependencies: f.dependencies,
        exports: f.exports,
        validated: f.validated,
      })),
      edges: config.edges.map(e => ({
        source: e.source,
        target: e.target,
        // Keep user-described semantic wiring (from the Connect & Describe
        // dialog) in the scaffold so the connection intent survives export.
        ...(e.data?.semantic
          ? {
              label: e.data.label,
              relation: e.data.relation,
              codeHint: e.data.codeHint,
              sourceHint: e.data.sourceHint,
              targetHint: e.data.targetHint,
              semantic: true,
            }
          : {}),
      })),
    };

    await fs.writeFile(
      path.join(outputDir, 'dependency-graph.json'),
      JSON.stringify(graphData, null, 2),
      'utf-8'
    );
    created.push('dependency-graph.json');

    // ── Detect primary language across all generated files ──
    const primaryLang = this.detectPrimaryLanguage(config.files);

    // ── Write entry point matching the primary language ──
    const entryCode = this.buildEntryPoint(config, primaryLang);
    const entryFileName = this.getEntryFileName(primaryLang);
    await fs.writeFile(path.join(outputDir, entryFileName), entryCode, 'utf-8');
    created.push(entryFileName);

    // ── Write project config files matching the primary language ──
    const projectConfigFiles = this.buildProjectConfig(config, primaryLang);
    for (const [fileName, content] of Object.entries(projectConfigFiles)) {
      await fs.writeFile(path.join(outputDir, fileName), content, 'utf-8');
      created.push(fileName);
      // Make startup scripts executable
      if (fileName === 'start.sh') {
        await fs.chmod(path.join(outputDir, fileName), 0o755);
      }
    }

    // ── Write README ──
    const readme = this.buildReadme(config, primaryLang, entryFileName);
    await fs.writeFile(path.join(outputDir, 'README.md'), readme, 'utf-8');
    created.push('README.md');

    // ── Write .gitignore ──
    const gitignore = this.buildGitignore(primaryLang);
    await fs.writeFile(path.join(outputDir, '.gitignore'), gitignore, 'utf-8');
    created.push('.gitignore');

    return {
      success: true,
      outputPath: outputDir,
      files: created,
      message: `Per-file project scaffolded at ${outputDir} — ${created.length} files created (${config.files.length} per-node source files).`,
      ...(warning ? { warning } : {}),
      perNodeFiles,
    };
  }

  /**
   * Detect the primary language across all generated files.
   * Falls back to 'typescript' if no files or mixed.
   */
  private detectPrimaryLanguage(files: GeneratedFile[]): string {
    if (files.length === 0) return 'typescript';
    const counts = new Map<string, number>();
    for (const f of files) {
      const lang = (f.language || 'typescript').toLowerCase();
      counts.set(lang, (counts.get(lang) || 0) + 1);
    }
    let maxCount = 0;
    let primary = 'typescript';
    for (const [lang, count] of counts) {
      if (count > maxCount) {
        maxCount = count;
        primary = lang;
      }
    }
    return primary;
  }

  /**
   * Get the entry point file name for a given language.
   */
  private getEntryFileName(language: string): string {
    switch (language) {
      case 'go': return 'main.go';
      case 'rust': return 'main.rs';
      case 'python': return 'main.py';
      default: return 'index.ts';
    }
  }

  /**
   * Build an entry point that imports and wires all nodes together,
   * matching the primary project language.
   */
  private buildEntryPoint(config: PerFileScaffoldConfig, primaryLang: string): string {
    switch (primaryLang) {
      case 'go': return this.buildGoEntryPoint(config);
      case 'rust': return this.buildRustEntryPoint(config);
      case 'python': return this.buildPythonEntryPoint(config);
      default: return this.buildTsEntryPoint(config);
    }
  }

  /**
   * Build a TypeScript entry point (index.ts) with standard imports.
   */
  private buildTsEntryPoint(config: PerFileScaffoldConfig): string {
    const lines: string[] = [];
    lines.push('/**');
    lines.push(` * ${config.projectName} — Auto-generated entry point`);
    lines.push(' * Generated by Veronica (VACA)');
    lines.push(' * Each node is a standalone file in src/');
    lines.push(' */');
    lines.push('');

    // Import each TS/JS file. A file with NO detected exports is imported for
    // its side effects — fabricating a name from the label (e.g. `scheme_picker`)
    // breaks `tsc --noEmit` with TS2305/TS2614 because that symbol does not exist.
    // Duplicate export names across files are aliased (main, main_1, ...) so the
    // same symbol is never imported twice in one module (TS2300).
    // Import each TS/JS file. A file with NO detected exports is imported for
    // its side effects — fabricating a name from the label (e.g. `scheme_picker`)
    // breaks `tsc --noEmit` with TS2305/TS2614 because that symbol does not exist.
    // Duplicate export names across files are aliased (main, main_1, ...) so the
    // same symbol is never imported twice in one module (TS2300).
    //
    // TYPE-ONLY exports (interfaces / type aliases) are never imported as
    // values: ESM crashes at runtime with "The requested module ... does not
    // provide an export named 'X'". The first VALUE export is used instead; a
    // file whose exports are all type-only is imported for side effects.
    const isTypeOnlyExport = (name: string, codeText: string) => {
      const esc = escapeRegExp(name);
      const typeDecl = new RegExp(`\\bexport\\s+(?:interface|type)\\s+${esc}(?:[^\\w$]|$)`);
      const valueDecl = new RegExp(`\\bexport\\s+(?:function|const|let|var|enum|class|async\\s+function)\\s+${esc}(?:[^\\w$]|$)`);
      return typeDecl.test(codeText) && !valueDecl.test(codeText);
    };
    const importedNames = new Set<string>();
    // Entry-point function names a non-UI project can be bootstrapped with.
    const ENTRY_FN_NAMES = new Set(['start', 'main', 'runApp']);
    let entryAlias: string | null = null;
    for (const file of config.files) {
      const lang = (file.language || '').toLowerCase();
      if (lang !== 'typescript' && lang !== 'javascript') continue;
      const safeName = labelToFileName(file.nodeLabel);
      const codeText = file.code || '';
      const firstExport = (file.exports || []).find(
        e => typeof e === 'string' && e.trim() !== '' && !isTypeOnlyExport(e, codeText)
      );
      if (!firstExport) {
        lines.push(`import './src/${safeName}/${file.fileName}';`);
        continue;
      }
      let local = firstExport;
      if (importedNames.has(firstExport)) {
        let i = 1;
        while (importedNames.has(`${firstExport}_${i}`)) i++;
        local = `${firstExport}_${i}`;
      }
      importedNames.add(local);
      lines.push(`import { ${firstExport} as ${local} } from './src/${safeName}/${file.fileName}';`);
      if (entryAlias === null && ENTRY_FN_NAMES.has(firstExport)) {
        entryAlias = local;
      }
    }

    // Add comments for non-TS files
    for (const file of config.files) {
      const lang = (file.language || '').toLowerCase();
      if (lang === 'typescript' || lang === 'javascript') continue;
      const safeName = labelToFileName(file.nodeLabel);
      lines.push(`// Note: ${file.fileName} is a ${lang} file — integrates separately`);
    }

    lines.push('');
    lines.push('// ── App Bootstrap ──');
    lines.push(`console.log('🚀 ${config.projectName} starting...');`);
    lines.push(`console.log('Target: ${config.targetOS}');`);
    if (config.appGoal) {
      lines.push(`console.log('Goal: ${config.appGoal}');`);
    }
    lines.push('');

    const tsFiles = config.files.filter(f => {
      const lang = (f.language || '').toLowerCase();
      return lang === 'typescript' || lang === 'javascript';
    });
    // Deduplicate export names: the re-export block must only emit names
    // that were ACTUALLY imported as local names (not the original export names
    // from the file, which may be default exports or aliased).
    // importedNames is the set of local names after aliasing, built in the
    // import loop above.
    if (tsFiles.length > 0) {
      lines.push(`// ${tsFiles.length} TypeScript modules loaded and ready`);
      if (importedNames.size > 0) {
        lines.push('export {');
        for (const name of [...importedNames].sort()) {
          lines.push(`  ${name},`);
        }
        lines.push('};');
      }
    }

    // ── Auto-bootstrap ──
    // For non-UI projects, invoke the app's entry function so `npm start`
    // actually RUNS the app instead of only importing and printing a banner.
    // Skipped for UI projects (the preview wrapper drives those) and guarded
    // with typeof so a missing entry can never crash module load.
    const hasUiNode = (config.nodes || []).some((n: any) => n.type === 'ui');
    const hasHtmlFile = config.files.some((f) => /\.html$/i.test(f.fileName));
    if (entryAlias && !hasUiNode && !hasHtmlFile) {
      lines.push('');
      lines.push('// ── App Bootstrap ──');
      lines.push(`if (typeof ${entryAlias} === 'function') { ${entryAlias}(); }`);
    }

    return lines.join('\n');
  }

  /**
   * Build a Go entry point (main.go) with package-level imports.
   */
  private buildGoEntryPoint(config: PerFileScaffoldConfig): string {
    const lines: string[] = [];
    lines.push('// ' + config.projectName + ' — Auto-generated entry point');
    lines.push('// Generated by Veronica (VACA)');
    lines.push('');
    lines.push('package main');
    lines.push('');

    // Import each Go file EXCEPT the program package: `package main` files are
    // executables and cannot be imported ("is a program, not an importable
    // package"). The root main.go below is the program; everything else is a
    // library package the program can import.
    for (const file of config.files) {
      const lang = (file.language || '').toLowerCase();
      if (lang !== 'go') continue;
      if (/^package\s+main\b/m.test(file.code || '')) continue;
      const safeName = labelToFileName(file.nodeLabel);
      const pkgPath = `src/${safeName}`;
      lines.push(`import "${this.sanitizeName(config.projectName)}/${pkgPath}"`);
    }

    lines.push('');
    lines.push('func main() {');
    lines.push(`  println("🚀 ${config.projectName} starting...")`);
    if (config.appGoal) {
      lines.push(`  println("Goal: ${config.appGoal}")`);
    }
    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Build a Rust entry point (main.rs) with #[path] mod declarations.
   *
   * Rust's module system resolves `mod foo;` relative to the current file.
   * Since node files are in src/<label>/<file>, we use #[path] attributes
   * to point Rust to the correct file locations.
   */
  private buildRustEntryPoint(config: PerFileScaffoldConfig): string {
    const lines: string[] = [];
    lines.push('// ' + config.projectName + ' — Auto-generated entry point');
    lines.push('// Generated by Veronica (VACA)');
    lines.push('');

    // Declare modules for each Rust file using #[path] for correct resolution
    for (const file of config.files) {
      const lang = (file.language || '').toLowerCase();
      if (lang !== 'rust') continue;
      const safeName = labelToFileName(file.nodeLabel);
      const modName = safeName.replace(/-/g, '_');
      lines.push(`#[path = "src/${safeName}/${file.fileName}"]`);
      lines.push(`mod ${modName};`);
    }

    lines.push('');
    lines.push('fn main() {');
    lines.push(`  println!("🚀 ${config.projectName} starting...");`);
    if (config.appGoal) {
      lines.push(`  println!("Goal: {}", "${config.appGoal}");`);
    }
    lines.push('}');

    return lines.join('\n');
  }

  /**
   * Build a Python entry point (main.py) with import statements.
   *
   * Python's per-file architecture puts each node in src/<module_name>/<file>.py
   * with an __init__.py that re-exports everything. The entry point imports from
   * these packages using underscored module names (since Python can't import
   * hyphenated directories).
   */
  private buildPythonEntryPoint(config: PerFileScaffoldConfig): string {
    const lines: string[] = [];
    lines.push('"""');
    lines.push(config.projectName + ' — Auto-generated entry point');
    lines.push('Generated by Veronica (VACA)');
    lines.push('"""');
    lines.push('import sys');
    lines.push('import os');
    lines.push('');
    lines.push('# Add src/ to the Python path so imports work');
    lines.push('sys.path.insert(0, os.path.join(os.path.dirname(__file__), "src"))');
    lines.push('');

    // Import each Python file
    for (const file of config.files) {
      const lang = (file.language || '').toLowerCase();
      if (lang !== 'python') continue;
      // Python directories use underscores (not hyphens) for valid module names
      const modName = labelToFileName(file.nodeLabel).replace(/-/g, '_');
      // Each node directory has __init__.py that re-exports from the main file
      lines.push(`from ${modName} import *  # src/${labelToFileName(file.nodeLabel).replace(/-/g, '_')}/${file.fileName}`);
    }

    lines.push('');
    lines.push('');
    lines.push('def main():');
    lines.push(`  print("🚀 ${config.projectName} starting...")`);
    if (config.appGoal) {
      lines.push(`  print(f"Goal: ${config.appGoal}")`);
    }
    lines.push('');
    lines.push('  # Auto-generated entry point — call node functions here');
    for (const file of config.files) {
      const lang = (file.language || '').toLowerCase();
      if (lang !== 'python') continue;
      const modName = labelToFileName(file.nodeLabel).replace(/-/g, '_');
      lines.push(`  # ${file.fileName}: add ${modName}.your_function() calls here`);
    }
    lines.push('  pass');
    lines.push('');
    lines.push('');
    lines.push('if __name__ == "__main__":');
    lines.push('  main()');

    return lines.join('\n');
  }

  /**
   * Build project configuration files matching the primary language.
   * Returns a map of filename → file content.
   */
  private buildProjectConfig(config: PerFileScaffoldConfig, primaryLang: string): Record<string, string> {
    switch (primaryLang) {
      case 'go': return this.buildGoProjectConfig(config);
      case 'rust': return this.buildRustProjectConfig(config);
      case 'python': return this.buildPythonProjectConfig(config);
      default: return this.buildTsProjectConfig(config);
    }
  }

  /**
   * Build TypeScript project config (package.json + tsconfig.json).
   */
  private buildTsProjectConfig(config: PerFileScaffoldConfig): Record<string, string> {
    const pkg: Record<string, any> = {
      name: this.sanitizeName(config.projectName),
      version: '1.0.0',
      description: config.appGoal || `${config.projectName} — generated app`,
      type: 'module',
      scripts: {
        // `node index.ts` cannot run TypeScript — tsx is the correct runner
        // (and is already a devDependency of every generated project).
        start: 'tsx index.ts',
        build: 'tsc',
        dev: 'tsx watch index.ts',
        test: 'echo "No tests configured"',
      },
      dependencies: {},
      devDependencies: {
        typescript: '^5.4.0',
        tsx: '^4.7.0',
        '@types/node': '^20.0.0',
      },
    };

    // Three structural fixes so every exported project compiles out of the box:
    //   1. rootDir must contain EVERY included file — index.ts lives at the root
    //      while node files live under src/, so './src' broke everything with
    //      TS6059. rootDir '.' covers both.
    //   2. Node files import siblings with explicit .ts extensions
    //      (../dep/dep.ts) — requires allowImportingTsExtensions, else every
    //      cross-file import fails with TS5097.
    //   3. noEmit: `build` is a pure typecheck and `start` runs tsx directly,
    //      so noEmit avoids the rewriteRelativeImportExtensions requirement.
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ESNext',
        moduleResolution: 'bundler',
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        allowImportingTsExtensions: true,
        noEmit: true,
      },
      include: ['src/**/*.ts', 'index.ts'],
    };

    return {
      'package.json': JSON.stringify(pkg, null, 2),
      'tsconfig.json': JSON.stringify(tsconfig, null, 2),
    };
  }

  /**
   * Build Go project config (go.mod + start.sh).
   */
  private buildGoProjectConfig(config: PerFileScaffoldConfig): Record<string, string> {
    const moduleName = this.sanitizeName(config.projectName);
    const goMod = `module ${moduleName}\n\ngo 1.22\n`;

    // Generate a startup script that builds and runs the Go app
    const binName = moduleName;
    const d = '$'; // literal dollar sign for bash variable references
    const startSh = `#!/usr/bin/env bash
set -euo pipefail

# ──────────────────────────────────────────────
# ${config.projectName} — Startup Script
# Generated by Veronica (VACA)
#
# Builds the Go binary (if needed) and runs it.
# Passes any CLI arguments through to the binary.
# ──────────────────────────────────────────────

BINARY="${binName}"
BUILD_DIR="./dist"
BINARY_PATH="${d}{BUILD_DIR}/${d}{BINARY}"

# Colors for output (using tput for portability)
GREEN=$(tput setaf 2 2>/dev/null || echo '')
CYAN=$(tput setaf 6 2>/dev/null || echo '')
YELLOW=$(tput setaf 3 2>/dev/null || echo '')
NC=$(tput sgr0 2>/dev/null || echo '')

echo ""
echo "${d}{CYAN}════════════════════════════════════════════${d}{NC}"
echo "${d}{CYAN}  🚀 ${config.projectName}${d}{NC}"
echo "${d}{CYAN}════════════════════════════════════════════${d}{NC}"
echo ""

# Build the binary if it doesn't exist or if source changed
if [ ! -f "${d}{BINARY_PATH}" ] || [ "$(find . -name '*.go' -newer "${d}{BINARY_PATH}" 2>/dev/null | head -1)" != "" ]; then
  echo "${d}{YELLOW}🔨 Building...${d}{NC}"
  mkdir -p "${d}{BUILD_DIR}"
  go build -o "${d}{BINARY_PATH}" .
  echo "${d}{GREEN}✅ Build complete: ${d}{BINARY_PATH}${d}{NC}"
  echo ""
fi

# Run the binary with any passed arguments
echo "${d}{CYAN}▶️  Starting ${d}{BINARY}...${d}{NC}"
echo "${d}{CYAN}─────────────────────────────────────────────${d}{NC}"
echo ""
exec "${d}{BINARY_PATH}" "${d}@"
`;

    return { 'go.mod': goMod, 'start.sh': startSh };
  }

  /**
   * Build Rust project config (Cargo.toml) with [[bin]] section.
   * The [[bin]] section tells Cargo the binary name and entry point path.
   * Without it, Cargo defaults to looking for src/main.rs, but our
   * entry point is at the root as main.rs.
   */
  private buildRustProjectConfig(config: PerFileScaffoldConfig): Record<string, string> {
    const binName = this.sanitizeName(config.projectName);
    const cargo = `[package]
name = "${binName}"
version = "0.1.0"
edition = "2021"
description = "${config.appGoal || config.projectName + ' — generated app'}"

[[bin]]
name = "${binName}"
path = "main.rs"

[dependencies]
`;
    return { 'Cargo.toml': cargo };
  }

  /**
   * Build Python project config (pyproject.toml).
   */
  private buildPythonProjectConfig(config: PerFileScaffoldConfig): Record<string, string> {
    const pyproject = `[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "${this.sanitizeName(config.projectName)}"
version = "0.1.0"
description = "${config.appGoal || config.projectName + ' — generated app'}"
requires-python = ">=3.10"

[tool.pytest.ini_options]
minversion = "7.0"
`;
    return { 'pyproject.toml': pyproject };
  }

  /**
   * Build a language-appropriate .gitignore.
   */
  private buildGitignore(language: string): string {
    switch (language) {
      case 'go':
        return '# Binaries\n*.exe\n*.exe~\n*.dll\n*.so\n*.dylib\n*.test\n*.out\n/go/\n\n# IDE\n.idea/\n.vscode/\n*.swp\n*.swo\n\n# Env\n.env\n';
      case 'rust':
        return '# Generated files\n/target/\n**/*.rs.bk\n\n# IDE\n.idea/\n.vscode/\n*.swp\n*.swo\n\n# Env\n.env\n';
      case 'python':
        return '# Bytecode\n__pycache__/\n*.py[cod]\n*$py.class\n\n# Virtualenv\n.venv/\nvenv/\nENV/\n\n# IDE\n.idea/\n.vscode/\n*.swp\n*.swo\n\n# Env\n.env\n';
      default:
        return 'node_modules/\ndist/\n.env\n';
    }
  }

  /**
   * Build a README describing the per-file project structure.
   */
  private buildReadme(config: PerFileScaffoldConfig, primaryLang: string, entryFileName: string): string {
    const lines: string[] = [];
    lines.push(`# ${config.projectName}`);
    lines.push('');
    lines.push('Generated by **Veronica (VACA)**');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push('## Overview');
    lines.push('');
    lines.push(`**Target OS:** ${config.targetOS}`);
    if (config.linuxDistro) lines.push(`**Linux Distro:** ${config.linuxDistro}`);
    if (config.appGoal) lines.push(`**Goal:** ${config.appGoal}`);
    if (config.appPurpose) lines.push(`**Purpose:** ${config.appPurpose}`);
    lines.push(`**Language:** ${primaryLang.charAt(0).toUpperCase() + primaryLang.slice(1)}`);
    lines.push('');
    lines.push('This project was generated using the **per-file architecture**:');
    lines.push('Each node on the architecture canvas corresponds to one source file.');
    lines.push('');
    lines.push('## Project Structure');
    lines.push('');
    lines.push('```');
    lines.push('.');

    // Structure entries differ by language
    const configFiles = this.buildProjectConfig(config, primaryLang);
    for (const cfgFile of Object.keys(configFiles)) {
      lines.push(`├── ${cfgFile.padEnd(22)} # Project configuration`);
    }
    lines.push(`├── ${entryFileName.padEnd(22)} # Entry point — imports all nodes`);
    lines.push('├── dependency-graph.json   # Node dependency metadata');
    lines.push('├── src/');
    for (const file of config.files) {
      const safeName = labelToFileName(file.nodeLabel);
      const status = file.validated ? '✅' : '⚠️';
      lines.push(`│   └── ${safeName}/`);
      lines.push(`│       └── ${file.fileName}  ${status}`);
    }
    lines.push('├── README.md');
    lines.push('└── .gitignore');
    lines.push('```');
    lines.push('');
    lines.push(`**${config.files.length} source files** across ${config.files.length} nodes.`);
    lines.push('');
    lines.push('## Quick Start');
    lines.push('');
    lines.push('```bash');
    if (primaryLang === 'go') {
      lines.push('# Run the app (builds and runs via startup script)');
      lines.push('chmod +x start.sh && ./start.sh');
      lines.push('');
      lines.push('# Or using raw Go commands:');
      lines.push('go run .');
      lines.push('go build -o dist/ .');
    } else if (primaryLang === 'rust') {
      lines.push('# Run the app');
      lines.push('cargo run');
      lines.push('');
      lines.push('# Build for production');
      lines.push('cargo build --release');
    } else if (primaryLang === 'python') {
      lines.push('# Run the app');
      lines.push('python main.py');
      lines.push('');
      lines.push('# Install dependencies (if any)');
      lines.push('pip install -r requirements.txt');
    } else {
      lines.push('# Install dependencies');
      lines.push('npm install');
      lines.push('');
      lines.push('# Run in development mode');
      lines.push('npm run dev');
      lines.push('');
      lines.push('# Build for production');
      lines.push('npm run build');
    }
    lines.push('```');
    lines.push('');
    lines.push('## Node Dependency Graph');
    lines.push('');
    for (const file of config.files) {
      const deps = file.dependencies.length > 0
        ? ` → depends on: ${file.dependencies.join(', ')}`
        : ' → no dependencies';
      lines.push(`- **${file.fileName}**${deps}`);
    }
    lines.push('');
    lines.push('---');
    lines.push(`*Generated on ${new Date().toISOString().split('T')[0]}*`);

    return lines.join('\n');
  }

  private sanitizeName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      || 'untitled';
  }
}
