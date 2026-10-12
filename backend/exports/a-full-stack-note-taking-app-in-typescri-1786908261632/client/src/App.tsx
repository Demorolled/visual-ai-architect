import React, { Component } from 'react';
import { NotesList } from './NotesList';
import { AddNote } from './AddNote';

interface AppState {
  notes: string[];
}

class App extends Component<{}, AppState> {
  state: AppState = {
    notes: [] as string[],
  };

  componentDidMount() {
    this.fetchNotes();
  }

  fetchNotes = () => {
    // Simulate fetching notes
    this.setState({ notes: ['Note 1', 'Note 2'] });
  };

  addNote = (note: string) => {
    this.setState((prevState) => ({
      notes: [...prevState.notes, note],
    }));
  };

  render() {
    return (
      <div>
        <h1>Notes</h1>
        <AddNote onAddNote={this.addNote} />
        <NotesList notes={this.state.notes} />
      </div>
    );
  }
}

export { App };