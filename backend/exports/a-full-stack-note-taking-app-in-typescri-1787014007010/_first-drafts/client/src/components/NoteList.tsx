import React from 'react';

interface Note {
  id: string;
  content: string;
}

interface NoteListProps {
  notes: Note[];
  onNoteClick: (note: Note) => void;
}

const NoteList: React.FC<NoteListProps> = ({ notes, onNoteClick }) => {
  return (
    <ul className='note-list'>
      {notes.map((note) => (
        <li key={note.id} onClick={() => onNoteClick(note)}>
          {note.content}
        </li>
      ))}
    </ul>
  );
};

export default NoteList;