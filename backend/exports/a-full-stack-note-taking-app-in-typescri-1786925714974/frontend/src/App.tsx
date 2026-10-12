import NoteList from './components/NoteList';
import NoteForm from './components/NoteForm';

function App() {
  return (
    <div>
      <h1>Notes</h1>
      <NoteForm />
      <NoteList />
    </div>
  );
}

export default App;