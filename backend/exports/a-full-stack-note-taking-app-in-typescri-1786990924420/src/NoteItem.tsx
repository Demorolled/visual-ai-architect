import React from 'react';

interface NoteItemProps {
  note: string;
  onDelete: () => void;
}

const NoteItem: React.FC<NoteItemProps> = ({ note, onDelete }) => {
  return (
    <div className="card">
      <h3>{note}</h3>
      <button className="btn" onClick={onDelete}>✕ Delete</button>
    </div>
  );
};

export default NoteItem;