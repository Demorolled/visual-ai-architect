import React, { useState } from 'react';

class NoteForm extends React.Component {
  state = {
    content: ''
  };

  handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    fetch('/notes', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ content: this.state.content })
    })
      .then(response => response.json())
      .then(data => {
        alert('Note added!');
      })
      .catch(error => {
        alert('Error adding note: ' + error.message);
      });
  };

  render() {
    return (
      <form onSubmit={this.handleSubmit}>
        <input
          type="text"
          value={this.state.content}
          onChange={e => this.setState({ content: e.target.value })}
          placeholder="Add a note"
        />
        <button type="submit">Add</button>
      </form>
    );
  }
}

export default NoteForm;