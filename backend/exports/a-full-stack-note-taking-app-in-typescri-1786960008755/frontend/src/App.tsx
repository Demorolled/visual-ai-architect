import React, { useState, useEffect } from 'react';
import NoteList from './NoteList';
import NoteForm from './NoteForm';

interface Note {
  id: number;
  title: string;
  content: string;
}

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    const savedNotes = localStorage.getItem('notes');
    if (savedNotes) {
      setNotes(JSON.parse(savedNotes));
    }
  }, []);

  const addNote = (note: Note) => {
    setNotes((prevNotes) => {
      const newNotes = [...prevNotes, note];
      localStorage.setItem('notes', JSON.stringify(newNotes));
      return newNotes;
    });
  };

  const deleteNote = (id: number) => {
    setNotes((prevNotes) => {
      const updatedNotes = prevNotes.filter((note) => note.id !== id);
      localStorage.setItem('notes', JSON.stringify(updatedNotes));
      return updatedNotes;
    });
  };

  return (
    <div>
      <h1>Note Taking App</h1>
      <NoteForm onAdd={addNote} />
      <NoteList notes={notes} onDelete={deleteNote} />
    </div>
  );
};

export default App;