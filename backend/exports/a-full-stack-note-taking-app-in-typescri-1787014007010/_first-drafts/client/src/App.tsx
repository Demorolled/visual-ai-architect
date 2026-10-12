import { addNote, deleteNote, getNotes } from '../server';

const App = () => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    const fetchNotes = async () => {
      try {
        const notes = await getNotes();
        setNotes(notes);
      } catch (error) {
        console.error('Error fetching notes:', error);
      }
    };
    fetchNotes();
  }, []);

  const handleAddNote = async () => {
    if (noteText.trim() === '') return;
    try {
      await addNote(noteText);
      setNoteText('');
      // Refresh the note list after adding a new note
      const notes = await getNotes();
      setNotes(notes);
    } catch (error) {
      console.error('Error adding note:', error);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      await deleteNote(id);
      // Refresh the note list after deleting a note
      const notes = await getNotes();
      setNotes(notes);
    } catch (error) {
      console.error('Error deleting note:', error);
    }
  };

  return (
    <div>
      <h1>Notes</h1>
      <input
        type="text"
        value={noteText}
        onChange={(e) => setNoteText(e.target.value)}
      />
      <button onClick={handleAddNote}>Add Note</button>
      <ul>
        {notes.map((note) => (
          <li key={note.id}>
            {note.text}{' '}
            <button onClick={() => handleDeleteNote(note.id)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
};

export default App;