import { v4 as uuidv4 } from 'uuid';

export function generateId(): string {
  return uuidv4();
}

export function validateNote(payload: CreateNotePayload): boolean {
  return payload.title.trim() !== '' && payload.content.trim() !== '';
}