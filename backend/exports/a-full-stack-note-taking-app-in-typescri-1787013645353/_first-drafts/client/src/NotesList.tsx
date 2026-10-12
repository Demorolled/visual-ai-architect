import React from 'react';

interface Note {
  id: number;
  title: string;
  content: string;
}

interface NotesListProps {
  notes: Note[];
  onDelete: (id: number) => void;
}

const NotesList: React.FC<NotesListProps> = ({ notes, onDelete }) => {
  return (
    <ul>
      {notes.map((note) => (
        <li key={note.id}>
          <h3>{note.title}</h3>
          <p>{note.content}</p>
          <button onClick={() => onDelete(note.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
};

export default NotesList;