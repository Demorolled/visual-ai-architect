import React, { useState, useEffect } from 'react';
import { fetchNotes, addNote } from './api';

interface Note {
  content: string;
}

const App = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    const loadNotes = async () => {
      const notes = await fetchNotes();
      setNotes(notes);
    };
    loadNotes();
  }, []);

  const handleAddNote = async () => {
    if (newNote.trim()) {
      await addNote({ content: newNote });
      setNotes([...notes, { content: newNote }]);
      setNewNote('');
    }
  };

  return (
    <div>
      <h1>Notes</h1>
      <ul>
        {notes.map((note, index) => (
          <li key={index}>{note.content}</li>
        ))}
      </ul>
      <input
        type="text"
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
      />
      <button onClick={handleAddNote}>Add Note</button>
    </div>
  );
};

export default App;