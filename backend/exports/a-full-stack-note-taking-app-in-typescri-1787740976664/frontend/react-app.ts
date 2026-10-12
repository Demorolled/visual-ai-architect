import React from 'react';

const NoteList: React.FC = () => {
  const notes = [] as Array<{ id: number; content: string }>; // Replace with actual note data
  return (
    <ul>
      {notes.map((note) => (
        <li key={note.id}>{note.content}</li>,
      ))}
    </ul>
  );
};

const NoteEditor: React.FC = () => {
  return (
    <div>
      <input type="text" placeholder="Add a note..." />
      <button>Add</button>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <div>
      <NoteList />
      <NoteEditor />
    </div>
  );
};

export default App;