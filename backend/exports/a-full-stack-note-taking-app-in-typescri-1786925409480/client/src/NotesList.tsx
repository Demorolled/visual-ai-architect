import React from 'react';

interface NotesListProps {
  notes: { id: number; text: string }[];
  onDeleteNote: (id: number) => void;
}

export const NotesList: React.FC<NotesListProps> = ({ notes, onDeleteNote }) => {
  return (
    <ul>
      {notes.map(note => (
        <li key={note.id}>
          {note.text}
          <button onClick={() => onDeleteNote(note.id)}>Delete</button>
        </li>
      ))}
    </ul>
  );
};