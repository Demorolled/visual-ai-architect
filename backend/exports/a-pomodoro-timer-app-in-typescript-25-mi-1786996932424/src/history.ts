export interface HistoryLog {
  id: number;
  status: 'work' | 'break';
  duration: number;
  timestamp: Date;
}

let sessionId = 0;
const sessions: HistoryLog[] = [];

export function addSession(status: 'work' | 'break', duration: number): void {
  sessionId++;
  sessions.push({ id: sessionId, status, duration, timestamp: new Date() });
}

export function getSessions(): HistoryLog[] {
  return sessions;
}