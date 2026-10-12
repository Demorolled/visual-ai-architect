import React, { useState } from 'react';
import { startServer } from '../api';

function App() {
  const [notes, setNotes] = useState<string[]>([]);

  const handleAddNote = () => {
    const note = prompt('Enter a note');
    if (note) {
      setNotes([...notes, note]);
    }
  };

  const handleDeleteNote = (index: number) => {
    const newNotes = [...notes];
    newNotes.splice(index, 1);
    setNotes(newNotes);
  };

  return (
    <div>
      <h1>Notes</h1>
      <button onClick={handleAddNote}>Add Note</button>
      <ul>
        {notes.map((note, index) => (
          <li key={index}>{note} <button onClick={() => handleDeleteNote(index)}>Delete</button></li>
        ))}
      </ul>
    </div>
  );
}

export default App;
