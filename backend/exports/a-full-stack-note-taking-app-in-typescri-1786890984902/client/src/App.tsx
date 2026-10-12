import React, { useState, useEffect } from 'react';
import NoteList from './components/NoteList';

interface Note {
  id: number;
  text: string;
}

const App: React.FC = () => {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    fetch('/notes')
      .then(response => response.json())
      .then(data => setNotes(data));
  }, []);

  return (
    <div>
      <h1>Notes</h1>
      <NoteList notes={notes} />
    </div>
  );
};

export default App;