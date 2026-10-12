import React, { useState } from 'react';
import { NotesService } from '../notes.ts';

const App: React.FC = () => {
  const [notes, setNotes] = useState<string[]>([]);

  const addNote = (note: string) => {
    setNotes([...notes, note]);
  };

  return (
    <div className="app">
      <h1>Note Taking App</h1>
      <input id="noteInput" type="text" placeholder="Enter note" onKeyPress={(e) => { if (e.key === 'Enter') addNote(e.currentTarget.value); }} />
      <button className="btn" onClick={() => { const note = document.getElementById('noteInput') as HTMLInputElement; addNote(note.value); note.value = ''; }}>➕ Add Note</button>
      <ul className="notes-list">
        {notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
    </div>
  );
};

export default App;