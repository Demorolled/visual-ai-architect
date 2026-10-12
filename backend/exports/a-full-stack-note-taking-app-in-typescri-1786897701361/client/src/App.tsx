import React, { useState } from 'react';
import { useNotes } from './useNotes';

const App = () => {
  const { notes, addNote } = useNotes();
  const [newNote, setNewNote] = useState('');

  const handleAddNote = async () => {
    if (newNote.trim()) {
      try {
        await addNote(newNote);
        setNewNote('');
      } catch (error) {
        console.error('Error adding note:', error);
      }
    }
  };

  return (
    <div>
      <h1>Notes</h1>
      <ul>
        {notes.map(note => (
          <li key={note.id}>{note.content}</li>
        ))}
      </ul>
      <input
        type='text'
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
      />
      <button onClick={handleAddNote}>Add Note</button>
    </div>
  );
};

export default App;