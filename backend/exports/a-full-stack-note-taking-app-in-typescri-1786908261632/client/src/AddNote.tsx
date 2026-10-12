import React, { useState } from 'react';

interface AddNoteProps {
  onAddNote: (note: string) => void;
}

const AddNote: React.FC<AddNoteProps> = ({ onAddNote }) => {
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim()) {
      onAddNote(note);
      setNote('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type='text'
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder='Add a note'
      />
      <button type='submit'>Add</button>
    </form>
  );
};

export { AddNote };
