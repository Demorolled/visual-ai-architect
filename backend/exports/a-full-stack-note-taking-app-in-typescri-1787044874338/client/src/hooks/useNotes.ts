import { useState, useEffect } from 'react';
import axios from 'axios';

interface Note {
  id: number;
  title: string;
  content: string;
}

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([]);

  useEffect(() => {
    axios.get<Note[]>('/api/notes').then(res => setNotes(res.data));
  }, []);

  return { notes };
}