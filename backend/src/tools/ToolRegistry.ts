/**
 * Veronica Tool Registry — central hub for registering, finding,
 * and executing tools with lifecycle management.
 */

import type {
  ToolDef,
  ToolContext,
  ToolResult,
  ToolExecution,
  ToolCategory,
  ToolRiskLevel,
  PermissionMode,
} from './Tool.js';
import { PermissionManager } from './permissions/PermissionManager.js';
import { v4 as uuid } from 'uuid';

// ─── Registry Events ────────────────────────────────────────────────────────

export type ToolEventType =
  | 'tool:registered'
  | 'tool:unregistered'
  | 'tool:before_execute'
  | 'tool:after_execute'
  | 'tool:error'
  | 'tool:interrupted';

export interface ToolEvent {
  type: ToolEventType;
  toolName: string;
  timestamp: number;
  executionId?: string;
  error?: string;
  durationMs?: number;
}

export type ToolEventHandler = (event: ToolEvent) => void;

// ─── Registry Configuration ─────────────────────────────────────────────────

export interface RegistryConfig {
  /** Default permission mode for tools without specific rules */
  defaultPermissionMode: PermissionMode;
  /** Whether to emit lifecycle events */
  emitEvents: boolean;
  /** Maximum number of concurrent tool executions */
  maxConcurrentExecutions: number;
  /** Default timeout in ms for tools that don't specify one */
  defaultTimeoutMs: number;
}

const DEFAULT_CONFIG: RegistryConfig = {
  defaultPermissionMode: 'allow_all',
  emitEvents: true,
  maxConcurrentExecutions: 50,
  defaultTimeoutMs: 120000,
};

// ─── Tool Query ─────────────────────────────────────────────────────────────

export interface ToolQuery {
  name?: string;
  category?: ToolCategory;
  riskLevel?: ToolRiskLevel;
  enabled?: boolean;
  search?: string;
}

// ─── Registry ───────────────────────────────────────────────────────────────

export class ToolRegistry {
  private tools = new Map<string, ToolDef>();
  private executions = new Map<string, ToolExecution>();
  private activeExecutionCount = 0;
  private config: RegistryConfig;
  private eventHandlers = new Set<ToolEventHandler>();
  public readonly permissionManager = new PermissionManager();

  constructor(config?: Partial<RegistryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    if (config?.defaultPermissionMode) {
      this.permissionManager.setDefaultMode(config.defaultPermissionMode);
    }
  }

  // ── Registration ──────────────────────────────────────────────────────────

  /** Register a single tool. Returns false if a tool with the same name exists or is malformed. */
  register(tool: ToolDef): boolean {
    if (!tool.name || !tool.description || !tool.inputSchema || typeof tool.call !== 'function') {
      return false;
    }
    if (this.tools.has(tool.name)) {
      return false;
    }
    this.tools.set(tool.name, tool);
    this.emit({ type: 'tool:registered', toolName: tool.name, timestamp: Date.now() });
    return true;
  }

  /** Register multiple tools at once. Returns count of successfully registered. */
  registerAll(...tools: ToolDef[]): number {
    let count = 0;
    for (const tool of tools) {
      if (this.register(tool)) count++;
    }
    return count;
  }

  /** Unregister a tool by name. */
  unregister(name: string): boolean {
    const existed = this.tools.delete(name);
    if (existed) {
      this.emit({ type: 'tool:unregistered', toolName: name, timestamp: Date.now() });
    }
    return existed;
  }

  // ── Lookup ────────────────────────────────────────────────────────────────

  /** Get a tool by name. */
  get(name: string): ToolDef | undefined {
    return this.tools.get(name);
  }

  /** Check if a tool is registered. */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /** Get all registered tool names. */
  get names(): string[] {
    return Array.from(this.tools.keys());
  }

  /** Get all registered tools (optionally filtered). */
  all(query?: ToolQuery): ToolDef[] {
    let results = Array.from(this.tools.values());

    if (query) {
      if (query.name) {
        results = results.filter(t => t.name === query.name);
      }
      if (query.category) {
        results = results.filter(t => t.category === query.category);
      }
      if (query.riskLevel) {
        results = results.filter(t => t.riskLevel === query.riskLevel);
      }
      if (query.enabled !== undefined) {
        results = results.filter(t => t.enabled !== false);
      }
      if (query.search) {
        const q = query.search.toLowerCase();
        results = results.filter(
          t =>
            t.name.toLowerCase().includes(q) ||
            t.description.toLowerCase().includes(q),
        );
      }
    }

    return results;
  }

  /** Get tools grouped by category. */
  get grouped(): Record<ToolCategory, ToolDef[]> {
    const groups = {} as Record<ToolCategory, ToolDef[]>;
    for (const tool of this.tools.values()) {
      if (!groups[tool.category]) groups[tool.category] = [];
      groups[tool.category].push(tool);
    }
    return groups;
  }

  /** Total number of registered tools. */
  get size(): number {
    return this.tools.size;
  }

  // ── Execution ─────────────────────────────────────────────────────────────

  /** Execute a tool by name with the given input and context. */
  async execute<Input = unknown, Output = unknown>(
    name: string,
    input: Input,
    context: ToolContext,
  ): Promise<ToolResult<Output>> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        error: `Tool not found: ${name}`,
        errorCode: 'TOOL_NOT_FOUND',
      };
    }

    if (tool.enabled === false) {
      return {
        success: false,
        error: `Tool is disabled: ${name}`,
        errorCode: 'TOOL_DISABLED',
      };
    }

    if (this.activeExecutionCount >= this.config.maxConcurrentExecutions) {
      return {
        success: false,
        error: 'Max concurrent tool executions reached',
        errorCode: 'EXECUTION_LIMIT',
      };
    }

    const executionId = uuid();
    const startedAt = Date.now();
    const execution: ToolExecution = {
      id: executionId,
      toolName: name,
      input,
      status: 'pending',
      startedAt,
    };
    this.executions.set(executionId, execution);
    this.activeExecutionCount++;
    this.emit({ type: 'tool:before_execute', toolName: name, timestamp: startedAt, executionId });

    const timeoutMs = (tool.timeoutMs ?? this.config.defaultTimeoutMs) || undefined;
    const timeoutSignal = timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined;
    const rawSignals = [context.signal, timeoutSignal].filter(Boolean) as AbortSignal[];
    const combinedSignal = rawSignals.length > 0 ? anySignal(rawSignals) : undefined;

    const effectiveMode = this.permissionManager.getEffectivePermission(name, tool, context);

    // ── Permission check via PermissionManager ──
    const permissionCheck = await this.permissionManager.check(tool, input, context);
    if (!permissionCheck.allowed) {
      const result: ToolResult<Output> = {
        success: false,
        error: permissionCheck.reason ?? 'Permission denied',
        errorCode: 'PERMISSION_DENIED',
      };
      execution.status = 'failed';
      execution.completedAt = Date.now();
      execution.result = result;
      execution.error = permissionCheck.reason;
      this.activeExecutionCount--;
      this.emit({
        type: 'tool:error',
        toolName: name,
        timestamp: Date.now(),
        executionId,
        error: permissionCheck.reason,
      });
      return result;
    }

    const toolContext: ToolContext = {
      ...context,
      permissionMode: effectiveMode,
      ...(combinedSignal ? { signal: combinedSignal } : {}),
    };

    try {
      // ── Execute ──
      execution.status = 'running';
      const result = await (tool.call as Function)(input, toolContext) as ToolResult<Output>;

      // ── Completion ──
      const completedAt = Date.now();
      result.durationMs = completedAt - startedAt;
      execution.status = result.success ? 'completed' : 'failed';
      execution.completedAt = completedAt;
      execution.result = result as unknown as ToolResult;
      if (!result.success && result.error) {
        execution.error = result.error;
      }

      this.activeExecutionCount--;

      // ── Post-execution hook ──
      if (tool.onAfterCall) {
        await tool.onAfterCall(input, result, toolContext).catch(() => {});
      }

      this.emit({
        type: result.success ? 'tool:after_execute' : 'tool:error',
        toolName: name,
        timestamp: completedAt,
        executionId,
        error: result.error,
        durationMs: result.durationMs,
      });

      return result;
    } catch (err) {
      const completedAt = Date.now();
      execution.status = 'failed';
      execution.completedAt = completedAt;
      execution.error = err instanceof Error ? err.message : String(err);
      this.activeExecutionCount--;

      this.emit({
        type: 'tool:error',
        toolName: name,
        timestamp: completedAt,
        executionId,
        error: execution.error,
        durationMs: completedAt - startedAt,
      });

      return {
        success: false,
        error: execution.error,
        errorCode: 'EXECUTION_ERROR',
      } as unknown as ToolResult<Output>;
    }
  }

  /** Interrupt a running tool execution. */
  async interrupt(executionId: string): Promise<boolean> {
    const execution = this.executions.get(executionId);
    if (!execution || execution.status !== 'running') return false;

    const tool = this.tools.get(execution.toolName);
    // Respect opt-out
    if (tool?.interruptBehavior === 'none') return false;

    execution.status = 'interrupted';
    execution.completedAt = Date.now();

    if (tool?.onInterrupt) {
      await tool.onInterrupt(execution.input, {} as ToolContext).catch(() => {});
    }

    this.emit({
      type: 'tool:interrupted',
      toolName: execution.toolName,
      timestamp: Date.now(),
      executionId,
    });

    return true;
  }

  // ── Execution History ─────────────────────────────────────────────────────

  /** Get execution history for a tool, optionally filtered by status. */
  getHistory(toolName?: string): ToolExecution[] {
    let results = Array.from(this.executions.values());
    if (toolName) {
      results = results.filter(e => e.toolName === toolName);
    }
    return results.sort((a, b) => b.startedAt - a.startedAt);
  }

  /** Get a specific execution by ID. */
  getExecution(id: string): ToolExecution | undefined {
    return this.executions.get(id);
  }

  /** Clear execution history older than the given timestamp. */
  clearHistory(before: number = Date.now()): number {
    let cleared = 0;
    for (const [id, exec] of this.executions) {
      if (exec.startedAt < before) {
        this.executions.delete(id);
        cleared++;
      }
    }
    return cleared;
  }

  // ── Permission Overrides (delegated to PermissionManager) ─────────────────

  /** Override the permission mode for a specific tool. */
  setPermissionOverride(toolName: string, mode: PermissionMode): void {
    this.permissionManager.setToolOverride(toolName, mode);
  }

  /** Remove a permission override. */
  clearPermissionOverride(toolName: string): void {
    this.permissionManager.clearToolOverride(toolName);
  }

  /** Get the effective permission mode for a tool (with optional context). */
  getEffectivePermission(toolName: string, context?: ToolContext): PermissionMode {
    const tool = this.tools.get(toolName);
    return this.permissionManager.getEffectivePermission(toolName, tool, context);
  }

  // ── Events ────────────────────────────────────────────────────────────────

  /** Subscribe to registry events. */
  on(handler: ToolEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /** Subscribe to a specific event type. */
  onEvent(type: ToolEventType, handler: ToolEventHandler): () => void {
    const wrapped: ToolEventHandler = (event) => {
      if (event.type === type) handler(event);
    };
    this.eventHandlers.add(wrapped);
    return () => this.eventHandlers.delete(wrapped);
  }

  private emit(event: ToolEvent): void {
    if (!this.config.emitEvents) return;
    for (const handler of this.eventHandlers) {
      try { handler(event); } catch { /* handler errors are silent */ }
    }
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  /** Generate an AI-friendly tool manifest for LLM function calling. */
  toToolManifest(): Array<{
    name: string;
    description: string;
    input_schema: Record<string, unknown>;
  }> {
    return this.all({ enabled: true }).map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as unknown as Record<string, unknown>,
    }));
  }

  /** Reset the registry to its initial state. */
  reset(): void {
    this.tools.clear();
    this.executions.clear();
    this.permissionManager.reset();
    this.activeExecutionCount = 0;
  }
}

// ─── Signal Helper ─────────────────────────────────────────────────────────

function anySignal(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

// ─── Singleton ──────────────────────────────────────────────────────────────

let defaultRegistry: ToolRegistry | null = null;

/** Get or create the global default registry instance. */
export function getRegistry(config?: Partial<RegistryConfig>): ToolRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new ToolRegistry(config);
  }
  return defaultRegistry;
}

/** Reset the global registry (useful for testing). */
export function resetRegistry(): void {
  defaultRegistry = null;
}
