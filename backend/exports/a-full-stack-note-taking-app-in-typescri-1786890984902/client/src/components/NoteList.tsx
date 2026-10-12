import React from 'react';

type Note = { id: number; text: string; };

type NoteListProps = {
  notes: Note[];
};

const NoteList: React.FC<NoteListProps> = ({ notes }) => {
  return (
    <ul>
      {notes.map(note => (
        <li key={note.id}>{note.text}</li>
      ))}
    </ul>
  );
};

export default NoteList;