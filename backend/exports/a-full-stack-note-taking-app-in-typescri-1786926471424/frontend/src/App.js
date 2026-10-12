import React, { useState, useEffect } from 'react';
import NoteList from './components/NoteList.js';
import NoteForm from './components/NoteForm.js';
import { addNote, getNotes } from './api/noteApi.js';

default function App() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    const fetchNotes = async () => {
      const notes = await getNotes();
      setNotes(notes);
    };
    fetchNotes();
  }, []);

  const handleAddNote = async (note) => {
    await addNote(note);
    const updatedNotes = await getNotes();
    setNotes(updatedNotes);
  };

  return (
    <div>
      <h1>Notes</h1>
      <NoteForm onAddNote={handleAddNote} />
      <NoteList notes={notes} />
    </div>
  );
}