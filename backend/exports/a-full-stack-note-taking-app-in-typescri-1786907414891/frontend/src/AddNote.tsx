import React, { useState } from 'react';

interface AddNoteProps {
  onAdd: (note: string) => void;
}

export const AddNote: React.FC<AddNoteProps> = ({ onAdd }) => {
  const [note, setNote] = useState('');

  const handleAdd = () => {
    if (note.trim()) {
      onAdd(note);
      setNote('');
    }
  };

  return (
    <div>
      <input
        type='text'
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button onClick={handleAdd}>Add Note</button>
    </div>
  );
};