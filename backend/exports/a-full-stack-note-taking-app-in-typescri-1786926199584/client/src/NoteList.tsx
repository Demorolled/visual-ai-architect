import React from 'react';
import { Note } from './types'; // Corrected path

export default function NoteList({ notes }: { notes: Note[] }) {
  return (
    <ul>
      {notes.map((note, index) => (
        <li key={index}>{note.text}</li>
      ))}
    </ul>
  );
}