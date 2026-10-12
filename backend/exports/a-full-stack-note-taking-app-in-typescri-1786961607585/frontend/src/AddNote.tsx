import React from 'react';

interface AddNoteProps {
  onAdd: (title: string, content: string) => void;
}

export const AddNote: React.FC<AddNoteProps> = ({ onAdd }) => {
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title && content) {
      onAdd(title, content);
      setTitle('');
      setContent('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="add-note-form">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        required
      />
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="Content"
        rows={4}
        required
      />
      <button type="submit">Add Note</button>
    </form>
  );
};
