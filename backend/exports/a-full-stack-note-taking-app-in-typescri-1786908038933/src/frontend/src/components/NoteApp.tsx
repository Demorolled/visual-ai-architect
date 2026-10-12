import React, { useState, useEffect } from 'react';
import NoteList from './NoteList';
import NoteForm from './NoteForm';

class NoteApp extends React.Component {
  state = {
    notes: [] as string[],
  };

  componentDidMount() {
    const storedNotes = localStorage.getItem('notes');
    if (storedNotes) {
      this.setState({ notes: JSON.parse(storedNotes) });
    }
  }

  addNote = (note: string) => {
    this.setState((prevState) => {
      const updatedNotes = [...prevState.notes, note];
      localStorage.setItem('notes', JSON.stringify(updatedNotes));
      return { notes: updatedNotes };
    });
  };

  render() {
    return (
      <div>
        <h1>Notes</h1>
        <NoteForm onAddNote={this.addNote} />
        <NoteList notes={this.state.notes} />
      </div>
    );
  }
}

export default NoteApp;