import React, { useState } from 'react';
import NotesList from './NotesList';
import AddNote from './AddNote';

interface Note {
  id: number;
  title: string;
  content: string;
}

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);

  const addNote = (title: string, content: string) => {
    setNotes([...notes, { id: Date.now(), title, content }]);
  };

  const deleteNote = (id: number) => {
    setNotes(notes.filter((note) => note.id !== id));
  };

  return (
    <div>
      <h1>Note Taking App</h1>
      <AddNote onAdd={addNote} />
      <NotesList notes={notes} onDelete={deleteNote} />
    </div>
  );
};

export default App;