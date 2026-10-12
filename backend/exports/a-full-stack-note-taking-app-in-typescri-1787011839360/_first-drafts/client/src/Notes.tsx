import React from 'react';

interface Note {
  id: number;
  title: string;
  content: string;
}

interface NotesProps {
  notes: Note[];
  onDelete: (id: number) => void;
}

const Notes: React.FC<NotesProps> = ({ notes, onDelete }) => {
  return (
    <div className="notes">
      {notes.map((note) => (
        <div key={note.id} className="note">
          <h3>{note.title}</h3>
          <p>{note.content}</p>
          <button onClick={() => onDelete(note.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
};

export default Notes;
