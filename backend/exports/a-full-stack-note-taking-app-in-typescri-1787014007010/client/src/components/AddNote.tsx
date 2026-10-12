import React, { useState } from 'react';

interface AddNoteProps {
  onAddNote: (content: string) => void;
}

const AddNote: React.FC<AddNoteProps> = ({ onAddNote }) => {
  const [content, setContent] = useState<string>('');

  const handleAdd = () => {
    if (content.trim()) {
      onAddNote(content);
      setContent('');
    }
  };

  return (
    <div className='add-note'>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={3} placeholder='Enter note...' className='note-input' />
      <button onClick={handleAdd} className='add-button'>Add</button>
    </div>
  );
};

export default AddNote;