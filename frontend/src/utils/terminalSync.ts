export const TERMINAL_CHANNEL = 'visual-ai-terminal';

export interface TerminalMessage {
  role: 'user' | 'ai';
  text: string;
  timestamp: string;
}

export type TerminalSyncMessage = {
  type: 'new-message';
  payload: TerminalMessage;
} | {
  type: 'sync-request';
} | {
  type: 'sync-response';
  payload: { messages: TerminalMessage[] };
} | {
  type: 'clear';
};

let channel: BroadcastChannel | null = null;

function getChannel() {
  if (!channel && typeof window !== 'undefined' && 'BroadcastChannel' in window) {
    channel = new BroadcastChannel(TERMINAL_CHANNEL);
  }
  return channel;
}

export function broadcastMessage(msg: TerminalMessage) {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: 'new-message', payload: msg });
  }
}

export function broadcastClear() {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: 'clear' });
  }
}

export function requestSync() {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: 'sync-request' });
  }
}

export function sendSyncResponse(messages: TerminalMessage[]) {
  const ch = getChannel();
  if (ch) {
    ch.postMessage({ type: 'sync-response', payload: { messages } });
  }
}

export function subscribeTerminal(
  onMessage: (msg: TerminalMessage) => void,
  onSyncRequest: () => void,
  onClear: () => void
) {
  const ch = getChannel();
  if (!ch) return () => {};

  ch.onmessage = (event: MessageEvent<TerminalSyncMessage>) => {
    const data = event.data;
    if (data.type === 'new-message') {
      onMessage(data.payload);
    } else if (data.type === 'sync-request') {
      onSyncRequest();
    } else if (data.type === 'clear') {
      onClear();
    }
  };

  return () => {
    ch.close();
    channel = null;
  };
}
