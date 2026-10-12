import { useState, useEffect } from 'react';

export function useNotes() {
  const [notes, setNotes] = useState([]);

  useEffect(() => {
    fetch('/notes')
      .then(response => response.json())
      .then(data => setNotes(data));
  }, []);

  const addNote = (note) => {
    fetch('/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(note),
    })
      .then(response => response.json())
      .then(newNote => setNotes([...notes, newNote]));
  };

  return { notes, addNote };
}