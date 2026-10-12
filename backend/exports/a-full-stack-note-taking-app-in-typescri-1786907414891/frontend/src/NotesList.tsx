import React from 'react';

interface NotesListProps {
  notes: string[];
}

export const NotesList: React.FC<NotesListProps> = ({ notes }) => {
  return (
    <ul>
      {notes.map((note, index) => (
        <li key={index}>{note}</li>
      ))}
    </ul>
  );
};