import React, { useState } from 'react';

interface NoteFormProps {
  onAddNote: (note: string) => void;
}

const NoteForm: React.FC<NoteFormProps> = ({ onAddNote }) => {
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
        required
      />
      <button type='submit'>Add</button>
    </form>
  );
};

export default NoteForm;