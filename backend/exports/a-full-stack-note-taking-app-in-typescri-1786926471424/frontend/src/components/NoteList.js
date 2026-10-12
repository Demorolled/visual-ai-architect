export default function NoteList({ notes }) {
  return (
    <ul>
      {notes.map((note, index) => (
        <li key={index}>{note.content}</li>
      ))}
    </ul>
  );
}