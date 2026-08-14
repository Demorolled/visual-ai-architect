/**
 * FileSystemTool — read, write, edit, and search files within the project.
 * Uses Node.js-native APIs only — no shell command execution.
 */

import type { ToolDef, ToolContext, ToolResult } from '../Tool.js';
import { access, readFile, writeFile, unlink, mkdir, stat, readdir } from 'fs/promises';
import { join, dirname, relative, basename, resolve } from 'path';
import { minimatch } from 'minimatch';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface FileReadInput {
  path: string;
  encoding?: 'utf-8' | 'base64';
  startLine?: number;
  endLine?: number;
}

export interface FileWriteInput {
  path: string;
  content: string;
  encoding?: 'utf-8' | 'base64';
  append?: boolean;
}

export interface FileEditInput {
  path: string;
  oldString: string;
  newString: string;
  all?: boolean;
}

export interface FileSearchInput {
  pattern: string;
  path?: string;
  maxResults?: number;
  includePattern?: string;
  excludePattern?: string;
}

export interface FileListInput {
  path: string;
  recursive?: boolean;
  pattern?: string;
}

export interface FileDeleteInput {
  path: string;
}

export type FileSystemOutput =
  | { content: string; path: string; size: number; lines: number }
  | { message: string; path: string }
  | { matches: Array<{ path: string; line: number; content: string }>; total: number }
  | { files: string[]; directories: string[] }
  | { deleted: boolean; path: string };

// ─── Helpers ────────────────────────────────────────────────────────────────

function countLines(content: string): number {
  return content.split('\n').length;
}

// ─── Tool: read_file ────────────────────────────────────────────────────────

const readFileToolDef: ToolDef<FileReadInput, FileSystemOutput> = {
  name: 'read_file',
  description: 'Read a file from the filesystem with optional line range',
  category: 'file_system',
  riskLevel: 'readonly',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file (relative to project root)' },
      encoding: { type: 'string', description: 'File encoding', enum: ['utf-8', 'base64'], default: 'utf-8' },
      startLine: { type: 'number', description: 'Starting line number (1-based)', required: false },
      endLine: { type: 'number', description: 'Ending line number (inclusive)', required: false },
    },
    required: ['path'],
  },

  async call(input: FileReadInput, ctx: ToolContext): Promise<ToolResult<FileSystemOutput>> {
    try {
      const filePath = resolve(input.path);
      await access(filePath);
      const stats = await stat(filePath);
      if (!stats.isFile()) {
        return { success: false, error: `Not a file: ${input.path}`, errorCode: 'NOT_A_FILE' };
      }
      const enc = input.encoding === 'base64' ? 'base64' as const : 'utf-8';
      let content = await readFile(filePath, enc) as string;
      if (input.startLine || input.endLine) {
        const lines = content.split('\n');
        const start = (input.startLine ?? 1) - 1;
        const end = input.endLine ?? lines.length;
        content = lines.slice(start, end).join('\n');
      }
      return {
        success: true,
        data: { content, path: input.path, size: stats.size, lines: countLines(content) },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'READ_ERROR' };
    }
  },
};

// ─── Tool: write_file ───────────────────────────────────────────────────────

const writeFileToolDef: ToolDef<FileWriteInput, FileSystemOutput> = {
  name: 'write_file',
  description: 'Write content to a file, creating directories as needed',
  category: 'file_system',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file (relative to project root)' },
      content: { type: 'string', description: 'Content to write' },
      encoding: { type: 'string', description: 'File encoding', enum: ['utf-8', 'base64'], default: 'utf-8' },
      append: { type: 'boolean', description: 'Append instead of overwrite', default: false },
    },
    required: ['path', 'content'],
  },

  async call(input: FileWriteInput, ctx: ToolContext): Promise<ToolResult<FileSystemOutput>> {
    try {
      const filePath = resolve(input.path);
      await mkdir(dirname(filePath), { recursive: true });
      const encoding = input.encoding || 'utf-8';
      if (input.append) {
        await writeFile(filePath, input.content, { encoding, flag: 'a' });
      } else {
        await writeFile(filePath, input.content, encoding);
      }
      const stats = await stat(filePath);
      return {
        success: true,
        data: { message: input.append ? 'Appended to file' : 'File written', path: input.path, size: stats.size, lines: countLines(input.content) },
        didModify: true,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'WRITE_ERROR' };
    }
  },
};

// ─── Tool: edit_file ────────────────────────────────────────────────────────

const editFileToolDef: ToolDef<FileEditInput, FileSystemOutput> = {
  name: 'edit_file',
  description: 'Edit a file by replacing text (single or all occurrences)',
  category: 'file_system',
  riskLevel: 'medium',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file' },
      oldString: { type: 'string', description: 'Text to replace' },
      newString: { type: 'string', description: 'Replacement text' },
      all: { type: 'boolean', description: 'Replace all occurrences', default: false },
    },
    required: ['path', 'oldString', 'newString'],
  },

  async call(input: FileEditInput, ctx: ToolContext): Promise<ToolResult<FileSystemOutput>> {
    try {
      const filePath = resolve(input.path);
      let content = await readFile(filePath, 'utf-8');
      const snippet = input.oldString.substring(0, 80);

      if (input.all) {
        const escaped = input.oldString.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, 'g');
        if (!regex.test(content)) {
          return { success: false, error: `String not found: "${snippet}"`, errorCode: 'STRING_NOT_FOUND' };
        }
        regex.lastIndex = 0;
        content = content.replace(regex, input.newString);
      } else {
        const idx = content.indexOf(input.oldString);
        if (idx === -1) {
          return { success: false, error: `String not found: "${snippet}"`, errorCode: 'STRING_NOT_FOUND' };
        }
        content = content.slice(0, idx) + input.newString + content.slice(idx + input.oldString.length);
      }

      await writeFile(filePath, content, 'utf-8');
      const stats = await stat(filePath);
      return {
        success: true,
        data: { message: `Edited ${input.path}`, path: input.path, size: stats.size, lines: countLines(content) },
        didModify: true,
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'EDIT_ERROR' };
    }
  },
};

// ─── Tool: search_file ──────────────────────────────────────────────────────

const searchFileToolDef: ToolDef<FileSearchInput, FileSystemOutput> = {
  name: 'search_file',
  description: 'Search file contents using grep pattern matching',
  category: 'file_system',
  riskLevel: 'readonly',
  inputSchema: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (plain text or regex)' },
      path: { type: 'string', description: 'Directory to search', required: false },
      maxResults: { type: 'number', description: 'Maximum results', default: 50 },
      includePattern: { type: 'string', description: 'Glob filter (e.g., "*.ts")', required: false },
      excludePattern: { type: 'string', description: 'Exclude glob (e.g., "node_modules")', required: false },
    },
    required: ['pattern'],
  },

  async call(input: FileSearchInput, ctx: ToolContext): Promise<ToolResult<FileSystemOutput>> {
    try {
      const searchDir = input.path ? resolve(input.path) : process.cwd();
      const maxResults = input.maxResults ?? 50;

      // Compile pattern as regex; fall back to literal escaping
      let regex: RegExp;
      try {
        regex = new RegExp(input.pattern);
      } catch {
        regex = new RegExp(input.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      }

      // Walk directory and collect candidate files
      let candidateFiles = await walkDirectory(searchDir);

      // Apply include/exclude glob filters
      if (input.includePattern) {
        candidateFiles = candidateFiles.filter(f => matchGlob(f, input.includePattern!));
      }
      if (input.excludePattern) {
        candidateFiles = candidateFiles.filter(f => !matchGlob(f, input.excludePattern!));
      }

      // Filter to text files only
      candidateFiles = candidateFiles.filter(isTextFile);

      // Search each file, accumulating matches
      const allMatches: Array<{ path: string; line: number; content: string }> = [];
      for (const filePath of candidateFiles) {
        if (allMatches.length >= maxResults) break;
        const fileMatches = await searchFile(filePath, regex, maxResults - allMatches.length, searchDir);
        allMatches.push(...fileMatches);
      }

      return { success: true, data: { matches: allMatches, total: allMatches.length } };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { success: false, error: msg, errorCode: 'SEARCH_ERROR' };
    }
  },
};

// ─── Helpers: File walking and pattern matching ───────────────────────────

/** Recursively walk a directory, returning absolute file paths.
 *  Skips common non-source directories (node_modules, .git) by default.
 *  Throws if the root directory does not exist. */
async function walkDirectory(
  dirPath: string,
  excludeDirs: string[] = ['node_modules', '.git', '.next', '__pycache__'],
): Promise<string[]> {
  // Verify the root directory exists upfront
  const rootStat = await stat(dirPath).catch(() => {
    throw new Error(`Directory not found: ${dirPath}`);
  });
  if (!rootStat.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  const files: string[] = [];

  async function walk(currentPath: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(currentPath, { withFileTypes: true });
    } catch {
      return; // skip inaccessible subdirectories
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const shouldSkip = excludeDirs.some(p => minimatch(entry.name, p));
        if (!shouldSkip) {
          await walk(join(currentPath, entry.name));
        }
      } else if (entry.isFile()) {
        files.push(join(currentPath, entry.name));
      }
    }
  }

  await walk(dirPath);
  return files;
}

/** Common binary extensions to skip during text search. */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.webp', '.avif',
  '.mp3', '.wav', '.ogg', '.flac', '.aac', '.wma',
  '.mp4', '.avi', '.mov', '.mkv', '.webm',
  '.zip', '.tar', '.gz', '.bz2', '.7z', '.rar', '.zst',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.ttf', '.otf', '.woff', '.woff2', '.eot',
  '.o', '.so', '.dll', '.dylib', '.exe', '.wasm',
  '.pyc', '.pyo', '.class', '.jar', '.dex', '.apk',
]);

function isTextFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().slice(filePath.lastIndexOf('.'));
  return !BINARY_EXTENSIONS.has(ext);
}

/** Glob-match a file path: checks full path first, then basename. */
function matchGlob(filePath: string, pattern: string): boolean {
  return minimatch(filePath, pattern) || minimatch(basename(filePath), pattern);
}

/** Search within a single file for a regex pattern. Returns up to `limit` matches. */
async function searchFile(
  filePath: string,
  regex: RegExp,
  limit: number,
  rootDir: string,
): Promise<Array<{ path: string; line: number; content: string }>> {
  const matches: Array<{ path: string; line: number; content: string }> = [];
  try {
    const content = await readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const relPath = relative(rootDir, filePath);

    for (let i = 0; i < lines.length && matches.length < limit; i++) {
      regex.lastIndex = 0;
      if (regex.test(lines[i])) {
        matches.push({ path: relPath, line: i + 1, content: lines[i].trim() });
      }
    }
  } catch {
    // skip unreadable/binary files
  }
  return matches;
}

// ─── Tool: list_files ───────────────────────────────────────────────────────

const listFileToolDef: ToolDef<FileListInput, FileSystemOutput> = {
  name: 'list_files',
  description: 'List files and directories at a given path',
  category: 'file_system',
  riskLevel: 'readonly',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Directory path (relative to project root)' },
      recursive: { type: 'boolean', description: 'List recursively', default: false },
      pattern: { type: 'string', description: 'Filter by glob pattern', required: false },
    },
    required: ['path'],
  },

  async call(input: FileListInput, ctx: ToolContext): Promise<ToolResult<FileSystemOutput>> {
    try {
      const dirPath = resolve(input.path);
      const dirStats = await stat(dirPath);
      if (!dirStats.isDirectory()) {
        return { success: false, error: `Not a directory: ${input.path}`, errorCode: 'NOT_A_DIR' };
      }

      if (input.recursive) {
        const allFiles = await walkDirectory(dirPath);
        let filtered = allFiles;
        if (input.pattern) {
          filtered = allFiles.filter(f => matchGlob(f, input.pattern!));
        }
        const files = filtered.slice(0, 200);
        return { success: true, data: { files, directories: [] } };
      }

      const entries = await readdir(dirPath, { withFileTypes: true });
      return {
        success: true,
        data: {
          files: entries.filter(e => e.isFile()).map(e => e.name),
          directories: entries.filter(e => e.isDirectory()).map(e => e.name),
        },
      };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'LIST_ERROR' };
    }
  },
};

// ─── Tool: delete_file ──────────────────────────────────────────────────────

const deleteFileToolDef: ToolDef<FileDeleteInput, FileSystemOutput> = {
  name: 'delete_file',
  description: 'Delete a file from the filesystem',
  category: 'file_system',
  riskLevel: 'high',
  inputSchema: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Path to the file (relative to project root)' },
    },
    required: ['path'],
  },

  async call(input: FileDeleteInput, ctx: ToolContext): Promise<ToolResult<FileSystemOutput>> {
    try {
      const filePath = resolve(input.path);
      const stats = await stat(filePath);
      if (stats.isDirectory()) {
        return { success: false, error: 'Cannot delete a directory with delete_file', errorCode: 'IS_DIRECTORY' };
      }
      await unlink(filePath);
      return { success: true, data: { deleted: true, path: input.path }, didModify: true };
    } catch (err: unknown) {
      return { success: false, error: err instanceof Error ? err.message : String(err), errorCode: 'DELETE_ERROR' };
    }
  },
};

// ─── Export as array (cast to ToolDef for registry compatibility) ───────────

export const fileSystemTools: ToolDef[] = [
  readFileToolDef,
  writeFileToolDef,
  editFileToolDef,
  searchFileToolDef,
  listFileToolDef,
  deleteFileToolDef,
] as ToolDef[];
