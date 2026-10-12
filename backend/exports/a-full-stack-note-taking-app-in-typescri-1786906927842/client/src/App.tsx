import React, { useState, useEffect } from 'react';
import { fetchNotes, addNote, updateNote, deleteNote } from './api/notes';

type Note = {
  id: string;
  content: string;
};

class App extends React.Component {
  state = {
    notes: [] as Note[],
    newNote: '',
    editingNote: { id: '', content: '' } as Note,
  };

  componentDidMount() {
    fetchNotes().then(notes => this.setState({ notes }));
  }

  handleAdd = () => {
    const { newNote } = this.state;
    if (newNote.trim()) {
      addNote(newNote).then(notes => this.setState({ notes, newNote: '' }));
    }
  };

  handleEdit = (id: string, content: string) => {
    this.setState({ editingNote: { id, content } });
  };

  handleUpdate = () => {
    const { editingNote } = this.state;
    if (editingNote.id && editingNote.content.trim()) {
      updateNote(editingNote.id, editingNote.content).then(notes => this.setState({ notes, editingNote: { id: '', content: '' } }));
    }
  };

  handleDelete = (id: string) => {
    deleteNote(id).then(notes => this.setState({ notes }));
  };

  render() {
    const { notes, newNote, editingNote } = this.state;
    return (
      <div>
        <h1>Notes</h1>
        <input
          type='text'
          value={newNote}
          onChange={(e) => this.setState({ newNote: e.target.value })}
          placeholder='Add a new note'
        />
        <button onClick={this.handleAdd}>Add</button>
        {editingNote.id && (
          <div>
            <input
              type='text'
              value={editingNote.content}
              onChange={(e) => this.setState({ editingNote: { ...editingNote, content: e.target.value } })}
              placeholder='Edit note'
            />
            <button onClick={this.handleUpdate}>Update</button>
          </div>
        )}
        <ul>
          {notes.map(note => (
            <li key={note.id}>
              {note.content}
              <button onClick={() => this.handleEdit(note.id, note.content)}>Edit</button>
              <button onClick={() => this.handleDelete(note.id)}>Delete</button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
}

export default App;