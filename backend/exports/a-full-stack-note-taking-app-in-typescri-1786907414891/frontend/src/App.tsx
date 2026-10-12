import React, { useState, useEffect } from 'react';
import { NotesList } from './NotesList';
import { AddNote } from './AddNote';

const App: React.FC = () => {
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/notes')
      .then((response) => response.json())
      .then((data) => setNotes(data.notes));
  }, []);

  const handleAdd = (note: string) => {
    setNotes([...notes, note]);
    fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
  };

  return (
    <div>
      <h1>Notes</h1>
      <NotesList notes={notes} />
      <AddNote onAdd={handleAdd} />
    </div>
  );
};

export default App;