export interface Note {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt?: number;
}

export interface CreateNotePayload {
  title: string;
  content: string;
}