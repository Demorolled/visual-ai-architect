import React, { useState, useEffect } from 'react';
import { NoteList } from './NoteList';
import { AddNote } from './AddNote';
import { fetchNotes, addNote, deleteNote } from './notesService';

export const App: React.FC = () => {
  const [notes, setNotes] = useState<{ id: string; title: string; content: string }[]>([]);

  useEffect(() => {
    fetchNotes().then(setNotes);
  }, []);

  const handleAdd = (title: string, content: string) => {
    const newNote = { id: Date.now().toString(), title, content };
    setNotes([...notes, newNote]);
    addNote(newNote);
  };

  const handleDelete = (id: string) => {
    deleteNote(id).then(() => {
      setNotes(notes.filter(note => note.id !== id));
    });
  };

  return (
    <div className="app">
      <h1>Note Taking App</h1>
      <AddNote onAdd={handleAdd} />
      <NoteList notes={notes} onDelete={handleDelete} />
    </div>
  );
};