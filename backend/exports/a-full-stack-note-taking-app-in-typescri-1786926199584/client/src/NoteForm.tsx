import React, { useState } from 'react';

interface Note {
  text: string;
}

interface NoteFormProps {
  onAddNote: (note: Note) => void;
}

export default function NoteForm({ onAddNote }: NoteFormProps) {
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      onAddNote({ text });
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
}