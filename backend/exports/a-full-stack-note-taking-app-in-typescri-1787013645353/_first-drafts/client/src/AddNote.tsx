import React, { useState } from 'react';

interface AddNoteProps {
  onAdd: (title: string, content: string) => void;
}

const AddNote: React.FC<AddNoteProps> = ({ onAdd }) => {
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title && content) {
      onAdd(title, content);
      setTitle('');
      setContent('');
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        required
      />
      <textarea
        placeholder="Content"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        required
      />      <button type="submit">Add Note</button>
    </form>
  );
};

export default AddNote;