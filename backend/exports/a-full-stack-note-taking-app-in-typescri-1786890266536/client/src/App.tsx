import React, { useState } from 'react';
import NoteList from './NoteList';
import AddNoteForm from './AddNoteForm';

const App = () => {
  const [notes, setNotes] = useState<{ id: string; text: string }[]>([]);

  const addNote = (text) => {
    const newNote = {
      id: Date.now().toString(),
      text,
    };
    setNotes([...notes, newNote]);
  };

  return (
    <div>
      <h1>Notes</h1>
      <AddNoteForm onAddNote={addNote} />
      <NoteList notes={notes} />
    </div>
  );
};

export default App;