import React, { useState } from 'react';

const AddNoteForm = ({ onAddNote }) => {
  const [text, setText] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (text.trim()) {
      onAddNote(text);
      setText('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a note"
      />
      <button type="submit">Add</button>
    </form>
  );
};

export default AddNoteForm;