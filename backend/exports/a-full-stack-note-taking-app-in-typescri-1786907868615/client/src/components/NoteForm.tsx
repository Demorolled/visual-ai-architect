import React, { useState } from 'react';

interface NoteFormProps {
  onAdd: (note: string) => void;
}

const NoteForm: React.FC<NoteFormProps> = ({ onAdd }) => {
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim()) {
      onAdd(note);
      setNote('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Add a note"
      />
      <button type="submit">Add</button>
    </form>
  );
};

export default NoteForm;