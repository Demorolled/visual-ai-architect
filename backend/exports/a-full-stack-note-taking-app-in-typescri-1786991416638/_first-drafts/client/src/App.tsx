import { NoteList } from '../components/NoteList.tsx';
import { NoteForm } from '../components/NoteForm.tsx';

export function App() {
  const [notes, setNotes] = React.useState([]);

  const addNote = (note) => {
    setNotes([...notes, note]);
  };

  return (
    <div>
      <h1>Notes</h1>
      <NoteForm onSubmit={addNote} />
      <NoteList notes={notes} />
    </div>
  );
}