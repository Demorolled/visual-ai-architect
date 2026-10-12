import React, { useState } from 'react';
import Notes from './Notes';
import NoteForm from './NoteForm';

function App() {
  const [notes, setNotes] = useState([]);
  const [newNoteTitle, setNewNoteTitle] = useState('');
  const [newNoteContent, setNewNoteContent] = useState('');

  const handleAddNote = async () => {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: newNoteTitle, content: newNoteContent }),
    });
    if (response.ok) {
      const newNotes = await response.json();
      setNotes(newNotes);
      setNewNoteTitle('');
      setNewNoteContent('');
    }
  };

  const handleDeleteNote = async (id: number) => {
    await fetch(`/api/notes/${id}`, { method: 'DELETE' });
    setNotes(notes.filter((note: any) => note.id !== id));
  };

  return (
    <div>
      <h1>Note Taking App</h1>
      <NoteForm onAddNote={handleAddNote} />
      <Notes notes={notes} onDeleteNote={handleDeleteNote} />
    </div>
  );
}

export default App;
