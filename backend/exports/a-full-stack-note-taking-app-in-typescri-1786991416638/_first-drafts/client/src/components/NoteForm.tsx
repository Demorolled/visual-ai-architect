export function NoteForm({ onSubmit }) {
  const [title, setTitle] = React.useState('');
  const [content, setContent] = React.useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit({ title, content });
  };

  return (
    <form onSubmit={handleSubmit}>
      <input type='text' value={title} onChange={(e) => setTitle(e.target.value)} placeholder='Title' required />
      <textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder='Content' required />
      <button type='submit'>Add Note</button>
    </form>
  );
}