export interface Note { id: number; title: string; content: string; createdAt: Date; updatedAt: Date; }
export interface NoteProps { title: string; content: string; }
export function saveNote(note: NoteProps): Note { const id = Date.now(); const n: Note = { id, title: note.title, content: note.content, createdAt: new Date(), updatedAt: new Date() }; return n; }
export function loadNotes(): Note[] { try { const saved = localStorage.getItem('notes'); if (!saved) return []; return JSON.parse(saved || '[]') as Note[]; } catch { return []; } }