import React from 'react';

type Note = {
  id: string;
  text: string;
};

type NoteListProps = {
  notes: Note[];
};

const NoteList = ({ notes }) => {
  return (
    <ul>
      {notes.map((note) => (
        <li key={note.id}>{note.text}</li>
      ))}
    </ul>
  );
};

export default NoteList;