import React, { useState } from 'react';

function App() {
  const [notes, setNotes] = useState(['Note 1']);
  const [newNote, setNewNote] = useState('');

  const handleAddNote = () => {
    if (newNote.trim()) {
      setNotes([...notes, newNote]);
      setNewNote('');
    }
  };

  const handleDeleteNote = (index: number) => {
    const updatedNotes = notes.filter((_, i) => i !== index);
    setNotes(updatedNotes);
  };

  return (
    <div>
      <ul>
        {notes.map((note, index) => (
          <li key={index}>{note} <button onClick={() => handleDeleteNote(index)}>Delete</button></li>
        ))}
      </ul>
      <input
        type='text'
        value={newNote}
        onChange={(e) => setNewNote(e.target.value)}
      />
      <button onClick={handleAddNote}>Add Note</button>
    </div>
  );
}

export default App;
