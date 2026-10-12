import { addNote, listNotes, deleteNote } from '../../notes';

export function App() {
  return (
    <div>
      <h1>Note Taking App</h1>
      <input type='text' placeholder='Enter note' />
      <button onClick={() => addNote('Sample note')}>Add Note</button>
      <ul>{listNotes().map(note => <li key={note.id}>{note.content} <button onClick={() => deleteNote(note.id)}>Delete</button></li>)}</ul>
    </div>
  );
}