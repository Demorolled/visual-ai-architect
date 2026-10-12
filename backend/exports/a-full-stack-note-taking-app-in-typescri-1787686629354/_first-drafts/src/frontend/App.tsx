import { FC, useState, useEffect } from 'react';
import { fetchNotes, createNote, deleteNote } from './api';

export const App: FC = () => {
  const [notes, setNotes] = useState<string[]>([]);
  const [newNote, setNewNote] = useState('');

  useEffect(() => {
    const load = async () => {
      const notes = await fetchNotes();
      setNotes(notes);
    };
    load();
  }, []);

  const handleCreate = async () => {
    if (!newNote.trim()) return;
    const created = await createNote(newNote);
    setNotes([...notes, created]);
    setNewNote('');
  };

  const handleDelete = async (id: string) => {
    await deleteNote(id);
    setNotes(notes.filter(n => n !== id));
  };

  return (
    <div className="app">
      <h1>Note Taking</h1>
      <div className="controls">
        <input
          type="text"
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="New note"
        />
        <button onClick={handleCreate}>➕ Add</button>
      </div>
      <ul className="notes-list">
        {notes.map((note, i) => (
          <li key={i}>
            {note}
            <button onClick={() => handleDelete(note)}>✕</button>
          </li>
        ))}
      </ul>
    </div>
  );
};