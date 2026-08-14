/**
 * Auto-Learning Frontend Utility
 * ==============================
 * 
 * Captures every user interaction and sends it to the backend's auto-learning
 * service. This makes the app learn from every conversation, code generation,
 * node edit, design save, and terminal interaction.
 * 
 * All calls are fire-and-forget — they never block or throw.
 */

// ─── Types ────────────────────────────────────────────────────────────────

export type InteractionType =
  | 'conversation'
  | 'code_generation'
  | 'node_created'
  | 'node_edited'
  | 'design_saved'
  | 'project_created'
  | 'project_completed'
  | 'terminal_message'
  | 'feedback';

interface RecordOptions {
  type: InteractionType;
  content: string;
  metadata?: Record<string, string>;
}

// ─── Rate limiter — at most 1 request per 200ms to avoid flooding ────────

let lastSendTime = 0;
const MIN_INTERVAL = 200;
const queue: RecordOptions[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function sendToBackend(options: RecordOptions): void {
  const now = Date.now();
  const wait = Math.max(0, MIN_INTERVAL - (now - lastSendTime));

  if (wait > 0) {
    queue.push(options);
    if (!flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null;
        const batch = queue.splice(0);
        lastSendTime = Date.now();
        sendBatch(batch);
      }, wait);
    }
    return;
  }

  lastSendTime = now;
  sendBatch([options]);
}

const MAX_BATCH_SIZE = 20; // Max records per request to prevent oversized payloads

async function sendBatch(batch: RecordOptions[]): Promise<void> {
  // Cap batch size to prevent oversized request bodies
  const toSend = batch.slice(0, MAX_BATCH_SIZE);
  try {
    await fetch('/api/auto-learn/record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-source': 'frontend' },
      body: JSON.stringify({
        type: toSend[0].type,
        content: toSend.length === 1 ? toSend[0].content : toSend.map(b => b.content).join('\n---\n'),
        metadata: toSend.length === 1 ? (toSend[0].metadata || {}) : { ...toSend[0].metadata, batched: String(toSend.length) },
      }),
    });
  } catch {
    // Fire-and-forget — never block
  }
  // If there are remaining items beyond the cap, send them in the next batch
  if (batch.length > MAX_BATCH_SIZE) {
    const remaining = batch.slice(MAX_BATCH_SIZE);
    setTimeout(() => sendBatch(remaining), 500);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────

export const autoLearn = {
  /** Record any interaction */
  record(type: InteractionType, content: string, metadata?: Record<string, string>): void {
    sendToBackend({ type, content, metadata });
  },

  /** Record a conversation turn (user prompt + AI response) */
  conversation(prompt: string, response: string, metadata?: Record<string, string>): void {
    sendToBackend({
      type: 'conversation',
      content: JSON.stringify({ prompt, response }),
      metadata: { ...metadata, promptLength: String(prompt.length), responseLength: String(response.length) },
    });
  },

  /** Record generated code */
  codeGeneration(nodeLabel: string, language: string, code: string, metadata?: Record<string, string>): void {
    sendToBackend({
      type: 'code_generation',
      content: code,
      metadata: { ...metadata, nodeLabel, language, codeLength: String(code.length) },
    });
  },

  /** Record a node being created/designed */
  nodeCreated(label: string, nodeType: string, language: string, description?: string): void {
    sendToBackend({
      type: 'node_created',
      content: description || '',
      metadata: { nodeLabel: label, nodeType, language },
    });
  },

  /** Record a design being saved */
  designSaved(projectName: string, nodeCount: number, summaryCode: string): void {
    sendToBackend({
      type: 'design_saved',
      content: summaryCode,
      metadata: { projectName, nodeCount: String(nodeCount) },
    });
  },

  /** Record a terminal message */
  terminalMessage(message: string, role: 'user' | 'ai'): void {
    sendToBackend({
      type: 'terminal_message',
      content: message.substring(0, 2000), // Truncate to avoid huge payloads
      metadata: { role },
    });
  },

  /** Record a project lifecycle event */
  projectEvent(event: 'created' | 'completed', projectName: string, nodeCount: number): void {
    sendToBackend({
      type: event === 'created' ? 'project_created' : 'project_completed',
      content: projectName,
      metadata: { projectName, nodeCount: String(nodeCount) },
    });
  },
};
