import React, { useState, useEffect } from 'react';

function App() {
  const [notes, setNotes] = useState<string[]>([]);
  const [note, setNote] = useState<string>('');

  useEffect(() => {
    fetchNotes();
  }, []);

  const fetchNotes = async () => {
    const response = await fetch('/notes');
    const data = await response.json();
    setNotes(data);
  };

  const addNote = async () => {
    if (!note) return;
    const response = await fetch('/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ note }),
    });
    if (response.ok) {
      setNotes([...notes, note]);
      setNote('');
    }
  };

  return (
    <div>
      <h1>Note Taking App</h1>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Enter a note"
      />
      <button onClick={addNote}>Add Note</button>
      <ul>
        {notes.map((n, i) => (
          <li key={i}>{n}</li>
        ))}
      </ul>
    </div>
  );
}

export default App;