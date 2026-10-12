import React from 'react';

interface Note {
  id: number;
  title: string;
  content: string;
}

const NoteList: React.FC<{ notes: Note[] }> = ({ notes }) => {
  return (
    <ul>
      {notes.map((note) => (
        <li key={note.id}>{note.title}</li>
      ))}
    </ul>
  );
};

export default NoteList;