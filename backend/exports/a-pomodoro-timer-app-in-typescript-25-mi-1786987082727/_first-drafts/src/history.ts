import { Session } from '../types/types.ts';

let history: Session[] = [];

export function saveSession(session: Session): void {
  history.push(session);
}

export function loadSessions(): Session[] {
  return history;
}