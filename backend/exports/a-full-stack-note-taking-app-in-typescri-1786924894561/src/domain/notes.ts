export interface Note {
  id: string;
  content: string;
}

export interface NoteCreate {
  content: string;
}

export interface NoteUpdate {
  id: string;
  content: string;
}