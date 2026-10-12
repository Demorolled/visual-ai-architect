import React, { useState } from 'react';

interface Note {
  id: number;
  title: string;
  content: string;
}

interface NoteFormProps {
  onAdd: (note: Note) => void;
}

const NoteForm: React.FC<NoteFormProps> = ({ onAdd }) => {
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim() && content.trim()) {
      const newNote = {
        id: Date.now(),
        title,
        content,
      };
      onAdd(newNote);
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
      />
      <button type="submit">Add Note</button>
    </form>
  );
};

export default NoteForm;