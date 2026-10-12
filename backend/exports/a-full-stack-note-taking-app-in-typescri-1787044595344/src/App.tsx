import React, { useState } from 'react';
import NoteList from './NoteList';
import AddNote from './AddNote';

const App = () => {
  const [notes, setNotes] = useState([]);

  const addNote = (note) => {
    setNotes([...notes, note]);
  };

  return (
    <div className="app">
      <h1>Note Taking App</h1>
      <AddNote onAdd={addNote} />
      <NoteList notes={notes} />
    </div>
  );
};

export default App;