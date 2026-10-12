import React, { useState, useEffect } from 'react';

const App: React.FC = () => {
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState<string>('');

  useEffect(() => {
    fetch('/api/notes')
      .then(response => response.json())
      .then(data => setNotes(data));
  }, []);

  const handleNoteChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setNewNote(event.target.value);
  };

  const handleAddNote = () => {
    if (newNote.trim()) {
      fetch('/api/notes', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: newNote }),
      })
        .then(response => response.json())
        .then(data => {
          setNotes([...notes, data.text]);
          setNewNote('');
        });
    }
  };

  return (
    <div>
      <h1>Notes</h1>
      <ul>
        {notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
      <input
        type="text"
        value={newNote}
        onChange={handleNoteChange}
      />
      <button onClick={handleAddNote}>Add Note</button>
    </div>
  );
};

export default App;