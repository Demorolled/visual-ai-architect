export const REASONING_CHANNEL = 'visual-ai-reasoning';

export interface ReasoningMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export type ReasoningSyncMessage =
  | { type: 'new-message'; payload: ReasoningMessage }
  | { type: 'sync-request' }
  | { type: 'sync-response'; payload: { messages: ReasoningMessage[] } }
  | { type: 'clear' };

let channel: BroadcastChannel | null = null;

function getChannel() {
  if (!channel && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(REASONING_CHANNEL);
  }
  return channel;
}

export function broadcastReasoningMessage(msg: ReasoningMessage) {
  const ch = getChannel();
  if (ch) ch.postMessage({ type: 'new-message', payload: msg });
}

export function broadcastReasoningClear() {
  const ch = getChannel();
  if (ch) ch.postMessage({ type: 'clear' });
}

export function requestReasoningSync() {
  const ch = getChannel();
  if (ch) ch.postMessage({ type: 'sync-request' });
}

export function sendReasoningSyncResponse(messages: ReasoningMessage[]) {
  const ch = getChannel();
  if (ch) ch.postMessage({ type: 'sync-response', payload: { messages } });
}

export function subscribeReasoning(
  onMessage: (msg: ReasoningMessage) => void,
  onSyncRequest: () => void,
  onClear: () => void,
  onSyncResponse?: (messages: ReasoningMessage[]) => void,
) {
  const ch = getChannel();
  if (!ch) return () => {};

  ch.onmessage = (event: MessageEvent<ReasoningSyncMessage>) => {
    const data = event.data;
    if (data.type === 'new-message') onMessage(data.payload);
    else if (data.type === 'sync-request') onSyncRequest();
    else if (data.type === 'clear') onClear();
    else if (data.type === 'sync-response' && data.payload?.messages && onSyncResponse) {
      onSyncResponse(data.payload.messages);
    }
  };

  return () => {
    ch.close();
    channel = null;
  };
}
