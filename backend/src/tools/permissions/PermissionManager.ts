/**
 * PermissionManager — centralized access control for the Veronica Tool System.
 *
 * Supports layered policy resolution (user → session → tool → pattern → risk → default),
 * an approval queue for interactive (`ask_each`) modes, and a full audit trail.
 *
 * Integration: ToolRegistry delegates its permission checks here instead of handling
 * them inline. The PermissionManager is designed to be a drop-in replacement for the
 * permission-related fields and methods currently on ToolRegistry.
 */

import type {
  ToolDef,
  ToolContext,
  ToolRiskLevel,
  PermissionMode,
  PermissionRule,
  PermissionCheck,
} from '../Tool.js';

// ─── Approval Request ───────────────────────────────────────────────────────

export interface ApprovalRequest {
  id: string;
  toolName: string;
  input: unknown;
  userId?: string;
  sessionId?: string;
  riskLevel: ToolRiskLevel;
  createdAt: number;
  status: 'pending' | 'approved' | 'denied';
  decidedAt?: number;
  decidedBy?: string;
}

// ─── Audit Entry ────────────────────────────────────────────────────────────

export interface AuditEntry {
  timestamp: number;
  toolName: string;
  userId?: string;
  sessionId?: string;
  mode: PermissionMode;
  allowed: boolean;
  reason?: string;
  decisionSource: string; // which policy layer decided
}

// ─── PermissionManager ──────────────────────────────────────────────────────

export class PermissionManager {
  // ── Policy layers (highest priority first) ──

  private defaultMode: PermissionMode = 'ask_each';
  private userPolicies = new Map<string, PermissionMode>();
  private sessionPolicies = new Map<string, PermissionMode>();
  private toolOverrides = new Map<string, PermissionMode>();
  private patternRules: PermissionRule[] = [];
  private riskLevelPolicies = new Map<ToolRiskLevel, PermissionMode>();

  // ── Approval queue ──

  private approvals = new Map<string, ApprovalRequest>();
  private approvalCounter = 0;

  // ── Audit trail ──

  private auditLog: AuditEntry[] = [];
  private maxAuditEntries = 1000;

  // ═════════════════════════════════════════════════════════════════════════
  // Configuration
  // ═════════════════════════════════════════════════════════════════════════

  setDefaultMode(mode: PermissionMode): void {
    this.defaultMode = mode;
  }

  getDefaultMode(): PermissionMode {
    return this.defaultMode;
  }

  // ── User policies ─────────────────────────────────────────────────────────

  setUserPolicy(userId: string, mode: PermissionMode): void {
    this.userPolicies.set(userId, mode);
  }

  getUserPolicy(userId: string): PermissionMode | undefined {
    return this.userPolicies.get(userId);
  }

  clearUserPolicy(userId: string): void {
    this.userPolicies.delete(userId);
  }

  // ── Session policies ──────────────────────────────────────────────────────

  setSessionPolicy(sessionId: string, mode: PermissionMode): void {
    this.sessionPolicies.set(sessionId, mode);
  }

  getSessionPolicy(sessionId: string): PermissionMode | undefined {
    return this.sessionPolicies.get(sessionId);
  }

  clearSessionPolicy(sessionId: string): void {
    this.sessionPolicies.delete(sessionId);
  }

  // ── Tool overrides ────────────────────────────────────────────────────────

  setToolOverride(toolName: string, mode: PermissionMode): void {
    this.toolOverrides.set(toolName, mode);
  }

  getToolOverride(toolName: string): PermissionMode | undefined {
    return this.toolOverrides.get(toolName);
  }

  clearToolOverride(toolName: string): void {
    this.toolOverrides.delete(toolName);
  }

  getAllToolOverrides(): Map<string, PermissionMode> {
    return new Map(this.toolOverrides);
  }

  // ── Pattern rules ─────────────────────────────────────────────────────────

  addRule(rule: PermissionRule): void {
    this.patternRules.push(rule);
  }

  removeRule(toolName: string): void {
    this.patternRules = this.patternRules.filter(r => r.toolName !== toolName);
  }

  getRules(toolName?: string): PermissionRule[] {
    if (toolName) {
      return this.patternRules.filter(r => r.toolName === toolName);
    }
    return [...this.patternRules];
  }

  // ── Risk-level policies ───────────────────────────────────────────────────

  setRiskLevelPolicy(level: ToolRiskLevel, mode: PermissionMode): void {
    this.riskLevelPolicies.set(level, mode);
  }

  getRiskLevelPolicy(level: ToolRiskLevel): PermissionMode | undefined {
    return this.riskLevelPolicies.get(level);
  }

  clearRiskLevelPolicy(level: ToolRiskLevel): void {
    this.riskLevelPolicies.delete(level);
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Permission Resolution
  // ═════════════════════════════════════════════════════════════════════════

  /**
   * Resolve the effective permission mode for a given tool and context,
   * consulting policy layers from highest to lowest priority.
   *
   * Priority order: user policy → session policy → tool override →
   * pattern rule → risk-level policy → default mode.
   */
  getEffectivePermission(toolName: string, tool?: ToolDef, context?: ToolContext): PermissionMode {
    // 1. User policy (most specific)
    if (context?.userId) {
      const userMode = this.userPolicies.get(context.userId);
      if (userMode) return userMode;
    }

    // 2. Session policy
    if (context?.sessionId) {
      const sessionMode = this.sessionPolicies.get(context.sessionId);
      if (sessionMode) return sessionMode;
    }

    // 3. Per-tool override
    const override = this.toolOverrides.get(toolName);
    if (override) return override;

    // 4. Pattern-based rule (exact match first, then glob match)
    const toolRules = this.patternRules.filter(r => r.toolName === toolName);
    if (toolRules.length > 0) {
      // Return the first matching rule's mode
      return toolRules[0].mode;
    }

    // 5. Risk-level policy
    if (tool?.riskLevel) {
      const riskMode = this.riskLevelPolicies.get(tool.riskLevel);
      if (riskMode) return riskMode;
    }

    // 6. Context permission mode (passed from request)
    if (context?.permissionMode) {
      return context.permissionMode;
    }

    // 7. Default (least specific)
    return this.defaultMode;
  }

  /**
   * Check whether a tool call is permitted.
   * Returns a PermissionCheck with the decision and reason.
   */
  async check(
    tool: ToolDef,
    input: unknown,
    context: ToolContext,
  ): Promise<PermissionCheck> {
    const effectiveMode = this.getEffectivePermission(tool.name, tool, context);

    // ── deny_all: always blocked ──
    if (effectiveMode === 'deny_all') {
      this.audit({
        toolName: tool.name,
        userId: context.userId,
        sessionId: context.sessionId,
        mode: 'deny_all',
        allowed: false,
        reason: `Tool '${tool.name}' is denied by permission policy`,
        decisionSource: effectiveMode,
      });
      return {
        allowed: false,
        reason: `Tool '${tool.name}' is denied by permission policy`,
        needsUserApproval: false,
      };
    }

    // ── allow_all: always permitted ──
    if (effectiveMode === 'allow_all') {
      this.audit({
        toolName: tool.name,
        userId: context.userId,
        sessionId: context.sessionId,
        mode: 'allow_all',
        allowed: true,
        decisionSource: effectiveMode,
      });
      return { allowed: true };
    }

    // ── plan_only: permitted but flagged ──
    if (effectiveMode === 'plan_only') {
      this.audit({
        toolName: tool.name,
        userId: context.userId,
        sessionId: context.sessionId,
        mode: 'plan_only',
        allowed: true,
        reason: 'Planning mode — tool execution is permitted for exploration',
        decisionSource: effectiveMode,
      });
      return { allowed: true, reason: 'Planning mode — execution permitted' };
    }

    // ── Check tool-level onBeforeCall hook ──
    if (tool.onBeforeCall) {
      const hookCheck = await tool.onBeforeCall(input, {
        ...context,
        permissionMode: effectiveMode,
      });
      if (!hookCheck.allowed) {
        this.audit({
          toolName: tool.name,
          userId: context.userId,
          sessionId: context.sessionId,
          mode: effectiveMode,
          allowed: false,
          reason: hookCheck.reason ?? 'Blocked by tool-level permission hook',
          decisionSource: 'onBeforeCall',
        });
        return hookCheck;
      }
    }

    // ── auto_approve: permitted without user interaction ──
    if (effectiveMode === 'auto_approve') {
      this.audit({
        toolName: tool.name,
        userId: context.userId,
        sessionId: context.sessionId,
        mode: 'auto_approve',
        allowed: true,
        reason: 'Auto-approved by permission policy',
        decisionSource: effectiveMode,
      });
      return { allowed: true };
    }

    // ── ask_each: requires user approval ──
    if (effectiveMode === 'ask_each') {
      const approval = this.createApprovalRequest(tool, input, context);
      this.audit({
        toolName: tool.name,
        userId: context.userId,
        sessionId: context.sessionId,
        mode: 'ask_each',
        allowed: false,
        reason: `Requires user approval (request ${approval.id})`,
        decisionSource: effectiveMode,
      });
      return {
        allowed: false,
        reason: `Tool '${tool.name}' requires your approval`,
        needsUserApproval: true,
      };
    }

    // Fallback: deny for unrecognized modes
    this.audit({
      toolName: tool.name,
      userId: context.userId,
      sessionId: context.sessionId,
      mode: effectiveMode,
      allowed: false,
      reason: `Unrecognized permission mode: ${effectiveMode}`,
      decisionSource: 'default',
    });
    return {
      allowed: false,
      reason: `Unrecognized permission mode: ${effectiveMode}`,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Approval Queue
  // ═════════════════════════════════════════════════════════════════════════

  private createApprovalRequest(
    tool: ToolDef,
    input: unknown,
    context: ToolContext,
  ): ApprovalRequest {
    const id = `aprv_${Date.now()}_${++this.approvalCounter}`;
    const request: ApprovalRequest = {
      id,
      toolName: tool.name,
      input,
      userId: context.userId,
      sessionId: context.sessionId,
      riskLevel: tool.riskLevel ?? 'low',
      createdAt: Date.now(),
      status: 'pending',
    };
    this.approvals.set(id, request);
    return request;
  }

  /** List all pending approval requests. */
  getPendingApprovals(): ApprovalRequest[] {
    const pending: ApprovalRequest[] = [];
    for (const req of this.approvals.values()) {
      if (req.status === 'pending') pending.push(req);
    }
    return pending.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Get a specific approval request by ID. */
  getApproval(id: string): ApprovalRequest | undefined {
    return this.approvals.get(id);
  }

  /** Approve a pending request. Returns false if not found or not pending. */
  approve(approvalId: string, decidedBy?: string): boolean {
    const req = this.approvals.get(approvalId);
    if (!req || req.status !== 'pending') return false;
    req.status = 'approved';
    req.decidedAt = Date.now();
    req.decidedBy = decidedBy;
    return true;
  }

  /** Deny a pending request. Returns false if not found or not pending. */
  deny(approvalId: string, decidedBy?: string): boolean {
    const req = this.approvals.get(approvalId);
    if (!req || req.status !== 'pending') return false;
    req.status = 'denied';
    req.decidedAt = Date.now();
    req.decidedBy = decidedBy;
    return true;
  }

  /** Clean up old approval requests (approved/denied + older than ttlMs). */
  cleanApprovals(ttlMs: number = 3600000): number {
    const cutoff = Date.now() - ttlMs;
    let cleaned = 0;
    for (const [id, req] of this.approvals) {
      if (req.status !== 'pending' && (req.decidedAt ?? 0) < cutoff) {
        this.approvals.delete(id);
        cleaned++;
      }
    }
    return cleaned;
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Audit Trail
  // ═════════════════════════════════════════════════════════════════════════

  private audit(entry: Omit<AuditEntry, 'timestamp'>): void {
    this.auditLog.push({ ...entry, timestamp: Date.now() });
    if (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog.splice(0, this.auditLog.length - this.maxAuditEntries);
    }
  }

  /** Get the full audit trail, newest first. */
  getAuditLog(limit?: number): AuditEntry[] {
    const log = [...this.auditLog].reverse();
    return limit ? log.slice(0, limit) : log;
  }

  /** Clear the audit trail. */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  /** Set the maximum number of audit entries to retain. */
  setMaxAuditEntries(max: number): void {
    this.maxAuditEntries = max;
    if (this.auditLog.length > max) {
      this.auditLog.splice(0, this.auditLog.length - max);
    }
  }

  // ═════════════════════════════════════════════════════════════════════════
  // Utilities
  // ═════════════════════════════════════════════════════════════════════════

  /** Reset the permission manager to its initial state. */
  reset(): void {
    this.defaultMode = 'ask_each';
    this.userPolicies.clear();
    this.sessionPolicies.clear();
    this.toolOverrides.clear();
    this.patternRules = [];
    this.riskLevelPolicies.clear();
    this.approvals.clear();
    this.approvalCounter = 0;
    this.auditLog = [];
  }

  /** Get a summary of the current policy configuration. */
  getPolicySummary(): {
    defaultMode: PermissionMode;
    userPolicies: Array<{ userId: string; mode: PermissionMode }>;
    sessionPolicies: Array<{ sessionId: string; mode: PermissionMode }>;
    toolOverrides: Array<{ toolName: string; mode: PermissionMode }>;
    patternRules: number;
    riskLevelPolicies: Array<{ level: ToolRiskLevel; mode: PermissionMode }>;
  } {
    return {
      defaultMode: this.defaultMode,
      userPolicies: Array.from(this.userPolicies.entries()).map(([userId, mode]) => ({ userId, mode })),
      sessionPolicies: Array.from(this.sessionPolicies.entries()).map(([sessionId, mode]) => ({ sessionId, mode })),
      toolOverrides: Array.from(this.toolOverrides.entries()).map(([toolName, mode]) => ({ toolName, mode })),
      patternRules: this.patternRules.length,
      riskLevelPolicies: Array.from(this.riskLevelPolicies.entries()).map(([level, mode]) => ({ level, mode })),
    };
  }
}
