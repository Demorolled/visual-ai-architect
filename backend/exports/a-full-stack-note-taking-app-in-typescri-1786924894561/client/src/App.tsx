import React, { useState, useEffect } from 'react';
import NotesList from './NotesList';
import NoteForm from './NoteForm';

const App = () => {
  const [notes, setNotes] = useState<{ id: number; content: string }[]>([]);

  useEffect(() => {
    fetch('/notes')
      .then(response => response.json())
      .then(data => setNotes(data));
  }, []);

  const handleNoteSubmit = (title: string, content: string) => {
    const newNote = { id: notes.length + 1, content };
    setNotes([...notes, newNote]);
  };

  return (
    <div>
      <h1>Notes</h1>
      <NotesList notes={notes} />
      <NoteForm onSubmit={handleNoteSubmit} />
    </div>
  );
};

export default App;