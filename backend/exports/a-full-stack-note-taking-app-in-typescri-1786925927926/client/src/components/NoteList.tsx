import React from 'react';

interface NoteListProps {
  notes: string[];
}

const NoteList: React.FC<NoteListProps> = ({ notes }) => {
  return (
    <ul>
      {notes.map((note, index) => (
        <li key={index}>{note}</li>
      ))}
    </ul>
  );
};

export default NoteList;