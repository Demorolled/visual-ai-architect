import React, { useState } from 'react';

interface Note {
  id: number;
  title: string;
  content: string;
}

const AddNote: React.FC<{ onAdd: (note: Note) => void }> = ({ onAdd }) => {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (title && content) {
      onAdd({ id: Date.now(), title, content });
      setTitle('');
      setContent('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Enter title"
        required
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Enter content"
        required
      ></textarea>
      <button type="submit">Add Note</button>
    </form>
  );
};

export default AddNote;