import React, { useState, useEffect } from 'react';
import NoteList from './components/NoteList';
import AddNoteForm from './components/AddNoteForm';

const App: React.FC = () => {
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    const storedNotes = localStorage.getItem('notes');
    if (storedNotes) {
      setNotes(JSON.parse(storedNotes));
    }
  }, []);

  const handleAddNote = (note: string) => {
    setNotes([...notes, note]);
    localStorage.setItem('notes', JSON.stringify([...notes, note]));
  };

  return (
    <div>
      <h1>Notes</h1>
      <AddNoteForm onAddNote={handleAddNote} />
      <NoteList notes={notes} />
    </div>
  );
};

export default App;