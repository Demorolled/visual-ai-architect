export interface NotesPayload { items: string[] }
export function readNotes(payload: NotesPayload): string[] { return payload.items; }