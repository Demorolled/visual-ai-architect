/**
 * Veronica Tool System — base interface for all tools.
 */

import type { Request, Response } from 'express';

// ─── Tool Risk Classification ───────────────────────────────────────────────
export type ToolRiskLevel = 'readonly' | 'low' | 'medium' | 'high' | 'critical';

export type ToolInterruptBehavior = 'none' | 'graceful' | 'immediate';

// ─── Tool Input / Output ────────────────────────────────────────────────────

/** JSON Schema-like descriptor for tool inputs */
export interface ToolInputSchema {
  type: 'object';
  properties: Record<string, {
    type: string;
    description: string;
    enum?: string[];
    default?: unknown;
    required?: boolean;
  }>;
  required?: string[];
}

/** The context provided to every tool call */
export interface ToolContext {
  userId?: string;
  projectId?: string;
  sessionId?: string;
  signal?: AbortSignal;
  metadata?: Record<string, unknown>;

  // Express integration
  req?: Request;
  res?: Response;

  // Permission state
  permissionMode?: PermissionMode;
}

/** The result returned by a tool call */
export interface ToolResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: string;
  
  /** Messages to append to the conversation */
  messages?: Array<{ role: string; content: string }>;
  
  /** Duration in ms */
  durationMs?: number;
  
  /** Whether this tool made side-effect changes */
  didModify?: boolean;
}

// ─── Permission System ──────────────────────────────────────────────────────

export type PermissionMode = 'allow_all' | 'auto_approve' | 'ask_each' | 'deny_all' | 'plan_only';

export interface PermissionRule {
  toolName: string;
  mode: PermissionMode;
  pattern?: string; // glob pattern for commands/files
}

export interface PermissionCheck {
  allowed: boolean;
  reason?: string;
  needsUserApproval?: boolean;
}

// ─── Tool Definition ────────────────────────────────────────────────────────

export interface ToolDef<Input = unknown, Output = unknown> {
  /** Unique tool name (kebab-case) */
  name: string;

  /** Human-readable description */
  description: string;

  /** Category for grouping */
  category: ToolCategory;

  /** Risk level for permission system */
  riskLevel: ToolRiskLevel;

  /** Input schema for validation */
  inputSchema: ToolInputSchema;

  /** Core execution function */
  call: (input: Input, context: ToolContext) => Promise<ToolResult<Output>>;

  // ── Lifecycle hooks ──

  /** Called before execution to check if allowed */
  onBeforeCall?: (input: Input, context: ToolContext) => Promise<PermissionCheck>;

  /** Called after execution for logging / side effects */
  onAfterCall?: (input: Input, result: ToolResult<Output>, context: ToolContext) => Promise<void>;

  /** Called if the tool is interrupted */
  onInterrupt?: (input: Input, context: ToolContext) => Promise<void>;

  // ── Feature flags ──

  /** Whether this tool is currently enabled */
  enabled?: boolean;

  /** Whether this tool can be interrupted mid-execution */
  interruptBehavior?: ToolInterruptBehavior;

  /** Default timeout in ms */
  timeoutMs?: number;
}

export type ToolCategory =
  | 'file_system'
  | 'execution'
  | 'web'
  | 'ai'
  | 'knowledge'
  | 'emotion'
  | 'project'
  | 'blueprint'
  | 'sandbox'
  | 'speech'
  | 'agent'
  | 'config'
  | 'task'
  | 'utility'
  | 'development'
  | 'testing'
  | 'network'
  | 'data'
  | 'design'
  | 'diagram'
  | 'monitoring'
  | 'notification';

// ─── Tool Execution Status ──────────────────────────────────────────────────

export interface ToolExecution {
  id: string;
  toolName: string;
  input: unknown;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'interrupted';
  startedAt: number;
  completedAt?: number;
  result?: ToolResult;
  error?: string;
}
