import React, { useState } from 'react';

interface AddNoteProps {
  onAddNote: (note: string) => void;
}

const AddNote: React.FC<AddNoteProps> = ({ onAddNote }) => {
  const [note, setNote] = useState<string>('');

  const handleNoteChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setNote(e.target.value);
  };

  const handleAddNote = () => {
    if (note.trim()) {
      onAddNote(note);
      setNote('');
    }
  };

  return (
    <div>
      <input
        type="text"
        value={note}
        onChange={handleNoteChange}
        placeholder="Add a note"
      />
      <button onClick={handleAddNote}>Add</button>
    </div>
  );
};

export default AddNote;