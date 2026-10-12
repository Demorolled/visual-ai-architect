import React from 'react';
import { useNotes } from './hooks/useNotes';

const App = () => {
  const notes = useNotes();

  return (
    <div className="app">
      <h1>Notes</h1>
      <div className="grid">
        {notes.map((note, index) => (
          <div key={index} className="card">
            <h3>{note.title}</h3>
            <p>{note.content}</p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default App;
