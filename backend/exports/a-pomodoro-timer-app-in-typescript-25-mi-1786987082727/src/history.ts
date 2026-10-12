import { Session } from './types';
let history: Session[] = [];

export function saveSession(session: Session): void {
  history.push(session);
}

export function loadSessions(): Session[] {
  return history;
}