import { useState, useEffect } from 'react';

export const useNotes = () => {
  const [notes, setNotes] = useState<string[]>([]);

  useEffect(() => {
    const storedNotes = localStorage.getItem('notes');
    if (storedNotes) {
      setNotes(JSON.parse(storedNotes));
    }
  }, []);

  const addNote = (note: string) => {
    setNotes((prevNotes) => {
      const updatedNotes = [...prevNotes, note];
      localStorage.setItem('notes', JSON.stringify(updatedNotes));
      return updatedNotes;
    });
  };

  const removeNote = (index: number) => {
    setNotes((prevNotes) => {
      const updatedNotes = prevNotes.filter((_, i) => i !== index);
      localStorage.setItem('notes', JSON.stringify(updatedNotes));
      return updatedNotes;
    });
  };

  return { notes, addNote, removeNote };
};