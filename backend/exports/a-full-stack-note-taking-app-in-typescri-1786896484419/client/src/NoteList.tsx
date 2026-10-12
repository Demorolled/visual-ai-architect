import React from 'react';

interface NoteListProps {
  notes: { id: number; content: string }[];
}

class NoteList extends React.Component<NoteListProps> {
  render() {
    const { notes } = this.props;
    return (
      <ul>
        {notes.map(note => (
          <li key={note.id}>{note.content}</li>
        ))}
      </ul>
    );
  }
}

export default NoteList;