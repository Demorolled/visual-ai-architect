import React, { useState, useEffect } from 'react';
import NotesList from './NotesList';
import AddNote from './AddNote';

const App: React.FC = () => {
  const [notes, setNotes] = useState<{ id: number; text: string }[]>([]);

  useEffect(() => {
    fetch('/notes')
      .then(response => response.json())
      .then(data => setNotes(data));
  }, []);

  const handleAddNote = (note: string) => {
    const newNote = { id: Date.now(), text: note };
    setNotes([...notes, newNote]);
    fetch('/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(newNote),
    });
  };

  const handleDeleteNote = (id: number) => {
    const updatedNotes = notes.filter(note => note.id !== id);
    setNotes(updatedNotes);
    fetch(`/notes/${id}`, {
      method: 'DELETE',
    });
  };

  return (
    <div>
      <h1>Notes</h1>
      <AddNote onAddNote={handleAddNote} />
      <NotesList notes={notes} onDeleteNote={handleDeleteNote} />
    </div>
  );
};

export default App;