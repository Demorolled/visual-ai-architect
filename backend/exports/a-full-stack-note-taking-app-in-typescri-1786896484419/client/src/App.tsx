import React, { useState, useEffect } from 'react';
import NoteList from './NoteList';
import NoteForm from './NoteForm';
import { getNotes, createNote } from './services/noteService';

class App extends React.Component {
  state = {
    notes: [] as { id: number; content: string }[]
  };

  componentDidMount() {
    this.fetchNotes();
  }

  fetchNotes = async () => {
    const notes = await getNotes();
    this.setState({ notes });
  };

  handleNoteSubmit = async (content: string) => {
    const newNote = await createNote({ content });
    this.setState(prevState => ({ notes: [...prevState.notes, newNote] }));
  };

  render() {
    const { notes } = this.state;
    return (
      <div>
        <NoteForm onNoteSubmit={this.handleNoteSubmit} />
        <NoteList notes={notes} />
      </div>
    );
  }
}

export default App;