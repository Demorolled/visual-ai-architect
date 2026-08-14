let codeMessages: { role: string; content: string }[] = [];
let reasoningMessages: { role: string; content: string }[] = [];
let codeListeners: Set<() => void> = new Set();
let reasoningListeners: Set<() => void> = new Set();

const MAX = 20;

export function pushCodeMessage(role: string, content: string) {
  codeMessages = [...codeMessages.slice(-(MAX - 1)), { role, content }];
  codeListeners.forEach((fn) => fn());
}

export function pushReasoningMessage(role: string, content: string) {
  reasoningMessages = [...reasoningMessages.slice(-(MAX - 1)), { role, content }];
  reasoningListeners.forEach((fn) => fn());
}

export function getCodeContext(): { role: string; content: string }[] {
  return codeMessages;
}

export function getReasoningContext(): { role: string; content: string }[] {
  return reasoningMessages;
}

const CONTEXT_SIZE = 6;

export function getCodeContextPrompt(): string {
  const msgs = codeMessages.slice(-CONTEXT_SIZE);
  if (msgs.length === 0) return '';
  return 'Recent LLM 2 (Code Builder) conversation:\n' + msgs.map((m) => `${m.role === 'user' ? 'User' : 'LLM 2'}: ${m.content}`).join('\n');
}

export function getReasoningContextPrompt(): string {
  const msgs = reasoningMessages.slice(-CONTEXT_SIZE);
  if (msgs.length === 0) return '';
  return 'Recent LLM 1 (Reasoning & Design) conversation:\n' + msgs.map((m) => `${m.role === 'user' ? 'User' : 'LLM 1'}: ${m.content}`).join('\n');
}

export function subscribeCodeChanges(fn: () => void) {
  codeListeners.add(fn);
  return () => codeListeners.delete(fn);
}

export function subscribeReasoningChanges(fn: () => void) {
  reasoningListeners.add(fn);
  return () => reasoningListeners.delete(fn);
}
