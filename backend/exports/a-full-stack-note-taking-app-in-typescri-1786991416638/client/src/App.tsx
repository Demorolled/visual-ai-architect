import { NoteList } from '../components/NoteList';
import { NoteForm } from '../components/NoteForm';
import React, { useState } from 'react';

interface Note {
  id: number;
  title: string;
  content: string;
}

export function App() {
  const [notes, setNotes] = useState<Note[]>([]);

  const addNote = (note: Note) => {
    setNotes([...notes, note]);
  };

  return (
    <div>
      <h1>Notes</h1>
      <NoteForm onSubmit={addNote} />
      <NoteList notes={notes} />
    </div>
  );
}