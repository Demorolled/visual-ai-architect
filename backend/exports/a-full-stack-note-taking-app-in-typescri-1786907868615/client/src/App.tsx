import React, { useState, useEffect } from 'react';
import NoteList from './components/NoteList';
import NoteForm from './components/NoteForm';

const App: React.FC = () => {
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    fetch('/notes')
      .then(response => response.json())
      .then(data => setNotes(data));
  }, []);

  const addNote = (note: string) => {
    setNotes([...notes, note]);
  };

  return (
    <div>
      <h1>Notes</h1>
      <NoteForm onAdd={addNote} />
      <NoteList notes={notes} />
    </div>
  );
};

export default App;