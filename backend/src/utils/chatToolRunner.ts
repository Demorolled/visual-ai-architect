/**
 * chatToolRunner — executes a detected chat tool request against the real
 * ToolRegistry (the same tools the code-generation pipeline uses) and formats
 * the REAL results into a context block that gets injected into the LLM call.
 *
 * The LLM never fakes a read/search/lookup: the platform does the work and the
 * model only ever summarizes actual data (or honestly reports a failure).
 */

import { dirname, isAbsolute, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { getRegistry } from '../tools/ToolRegistry.js';
import type { ToolContext } from '../tools/Tool.js';
import type { ChatToolKind, ChatToolRequest } from './chatToolDetector.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** backend/src/utils → project root. */
export const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');

const MAX_FILE_CHARS = 6000;
const MAX_SEARCH_CHARS = 3000;
const MAX_WEB_CHARS = 3000;
const MAX_KNOWLEDGE_CHARS = 3000;

export interface ChatToolOutcome {
  handled: boolean;
  tool?: ChatToolKind;
  display?: string;
  /** Markdown-ish text block with the REAL tool output, injected pre-prompt. */
  contextBlock?: string;
}

/** Truncate the middle of a long result, keeping head + tail readable. */
export function truncateMid(s: string, max: number): string {
  if (s.length <= max) return s;
  const head = Math.floor(max * 0.6);
  const tail = max - head;
  return s.slice(0, head) + `\n… [truncated, ${s.length - max} chars omitted] …\n` + s.slice(-tail);
}

interface RawToolData {
  content?: string;
  path?: string;
  size?: number;
  lines?: number;
  matches?: Array<{ path?: string; line?: number; content?: string }>;
  results?: unknown[];
  text?: string;
  patterns?: unknown[];
  context?: unknown;
  total?: number;
}

/** Format one search match into a readable line. */
function formatMatch(m: { path?: string; line?: number; content?: string }): string {
  const file = m.path || '';
  const line = m.line != null ? `:${m.line}` : '';
  const text = (m.content || '').trim();
  return text ? `${file}${line}: ${text}` : `${file}${line}`;
}

export async function runChatTool(req: ChatToolRequest): Promise<ChatToolOutcome> {
  const registry = getRegistry();
  const startedAt = Date.now();
  const ms = () => Date.now() - startedAt;
  // These tools are read-only / low-risk and the user explicitly asked for
  // them in chat, so they run without the approval gate (the registry defaults
  // to 'ask_each' — resolution order in PermissionManager honors this field).
  const ctx: ToolContext = { sessionId: 'chat', permissionMode: 'allow_all' };

  // ── read_file ──
  if (req.tool === 'read_file') {
    const rawPath = String(req.input.path || '');
    const target = isAbsolute(rawPath) ? rawPath : join(PROJECT_ROOT, rawPath);
    const result = await registry.execute<{ path: string }, RawToolData>('read_file', { path: target }, ctx);
    if (!result.success || typeof result.data?.content !== 'string') {
      return {
        handled: true,
        tool: req.tool,
        display: req.display,
        contextBlock:
          `[REAL TOOL RESULT — read_file FAILED]\n` +
          `The platform tried to read "${req.display}" but got: ${result.error || 'no content returned'}.\n` +
          `Reply honestly: the file could not be read. Offer to create it, or ask the user for the correct path.`,
      };
    }
    const data = result.data;
    const content = truncateMid(data.content as string, MAX_FILE_CHARS);
    return {
      handled: true,
      tool: req.tool,
      display: req.display,
      contextBlock:
        `[REAL FILE CONTENT — read_file tool, ${ms()}ms]\n` +
        `Path: ${data.path || target}\n` +
        `Size: ${data.size ?? '?'} bytes, ${data.lines ?? '?'} lines\n` +
        `──────\n${content}\n──────\n` +
        `Answer the user's question based ONLY on this real file content above. ` +
        `If the content is empty or unclear, say so honestly.`,
    };
  }

  // ── search_file ──
  if (req.tool === 'search_file') {
    const result = await registry.execute<{ pattern: string; path: string; maxResults: number }, RawToolData>(
      'search_file',
      {
        pattern: String(req.input.pattern),
        path: String(req.input.path || PROJECT_ROOT),
        maxResults: Number(req.input.maxResults) || 25,
      },
      ctx,
    );
    if (!result.success) {
      return {
        handled: true,
        tool: req.tool,
        display: req.display,
        contextBlock:
          `[REAL TOOL RESULT — search_file FAILED]\n` +
          `The platform tried to search the code for "${req.input.pattern}" but got: ${result.error}.\n` +
          `Reply honestly about the failure and suggest a simpler search.`,
      };
    }
    const matches = Array.isArray((result.data as RawToolData)?.matches) ? (result.data as RawToolData).matches! : [];
    const text =
      matches.length > 0
        ? truncateMid(matches.map(formatMatch).join('\n'), MAX_SEARCH_CHARS)
        : `(no matches found for "${req.input.pattern}")`;
    return {
      handled: true,
      tool: req.tool,
      display: req.display,
      contextBlock:
        `[REAL CODE SEARCH — search_file tool, ${ms()}ms]\n` +
        `Pattern: "${req.input.pattern}" — ${matches.length} match${matches.length === 1 ? '' : 'es'}\n` +
        `──────\n${text}\n──────\n` +
        `Answer the user's question based ONLY on these real search results. ` +
        `If nothing matched, say so honestly and suggest a different search.`,
    };
  }

  // ── web_search ──
  if (req.tool === 'web_search') {
    const result = await registry.execute<{ query: string; maxResults: number }, RawToolData>(
      'web_search',
      { query: String(req.input.query), maxResults: Number(req.input.maxResults) || 5 },
      ctx,
    );
    if (!result.success) {
      return {
        handled: true,
        tool: req.tool,
        display: req.display,
        contextBlock:
          `[REAL TOOL RESULT — web_search FAILED]\n` +
          `The platform tried to search the web for "${req.input.query}" but got: ${result.error}.\n` +
          `Reply honestly that the web search could not be completed.`,
      };
    }
    const text = (result.data as RawToolData)?.text || '(no readable results returned)';
    return {
      handled: true,
      tool: req.tool,
      display: req.display,
      contextBlock:
        `[REAL WEB RESULTS — web_search tool, ${ms()}ms]\n` +
        `Query: "${req.input.query}"\n` +
        `──────\n${truncateMid(String(text), MAX_WEB_CHARS)}\n──────\n` +
        `Answer the user's question based ONLY on these real web results. ` +
        `If the results are thin or empty, say so honestly instead of inventing facts.`,
    };
  }

  // ── knowledge_query ──
  if (req.tool === 'knowledge_query') {
    const result = await registry.execute<{ query: string; maxResults: number }, RawToolData>(
      'knowledge_query',
      { query: String(req.input.query), maxResults: Number(req.input.maxResults) || 10 },
      ctx,
    );
    if (!result.success) {
      return {
        handled: true,
        tool: req.tool,
        display: req.display,
        contextBlock:
          `[REAL TOOL RESULT — knowledge_query FAILED]\n` +
          `The platform tried to query the knowledge base for "${req.input.query}" but got: ${result.error}.\n` +
          `Reply honestly about the failure.`,
      };
    }
    const data = result.data as RawToolData | undefined;
    const patterns = Array.isArray(data?.patterns) ? (data.patterns as unknown[]) : [];
    const patternText =
      patterns.length > 0
        ? truncateMid(JSON.stringify(patterns, null, 1), MAX_KNOWLEDGE_CHARS)
        : `(no knowledge-base patterns found for "${req.input.query}")`;
    return {
      handled: true,
      tool: req.tool,
      display: req.display,
      contextBlock:
        `[REAL KNOWLEDGE — knowledge_query tool, ${ms()}ms]\n` +
        `Query: "${req.input.query}" — ${patterns.length} pattern${patterns.length === 1 ? '' : 's'}\n` +
        `──────\n${patternText}\n──────\n` +
        `Answer the user's question based ONLY on these real knowledge-base results. ` +
        `If the knowledge base has nothing relevant, say so honestly and rely on what you actually know.`,
    };
  }

  return { handled: false };
}
