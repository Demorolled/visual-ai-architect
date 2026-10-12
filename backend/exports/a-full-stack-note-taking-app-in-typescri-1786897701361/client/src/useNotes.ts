import { useEffect, useState } from 'react';
import axios from 'axios';

export function useNotes() {
  const [notes, setNotes] = useState<{ id: number, content: string }[]>([]);

  useEffect(() => {
    axios.get('/notes')
      .then(response => setNotes(response.data))
      .catch(error => console.error('Error fetching notes:', error));
  }, []);

  return notes;
}