import React from 'react';

interface NoteListProps {
  notes: string[];
}

class NoteList extends React.Component<NoteListProps> {
  render() {
    return (
      <ul>
        {this.props.notes.map((note, index) => (
          <li key={index}>{note}</li>
        ))}
      </ul>
    );
  }
}

export default NoteList;