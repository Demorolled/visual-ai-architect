import React, { useState } from 'react';

export default function NoteForm({ onAddNote }) {
  const [content, setContent] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onAddNote(content);
    setContent('');
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type='text'
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder='Add a note'
      />
      <button type='submit'>Add</button>
    </form>
  );
}