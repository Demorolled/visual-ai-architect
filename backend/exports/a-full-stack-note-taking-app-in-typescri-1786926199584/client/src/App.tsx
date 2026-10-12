import React, { useState, useEffect } from 'react';
import { Note } from './types';
import NoteForm from './NoteForm';
import NoteList from './NoteList';

class App extends React.Component {
  state = {
    notes: [] as Note[],
  };

  componentDidMount() {
    fetch('/api/notes')
      .then(response => response.json())
      .then(notes => this.setState({ notes }))
      .catch(error => console.error('Error fetching notes:', error));
  }

  addNote = (note: Note) => {
    fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(note)
    })
    .then(response => response.json())
    .then(newNote => this.setState(prevState => ({ notes: [...prevState.notes, newNote] })))
    .catch(error => console.error('Error adding note:', error));
  };

  render() {
    const { notes } = this.state;
    return (
      <div>
        <h1>Notes</h1>
        <NoteForm onAddNote={this.addNote} />
        <NoteList notes={notes} />
      </div>
    );
  }
}

export default App;