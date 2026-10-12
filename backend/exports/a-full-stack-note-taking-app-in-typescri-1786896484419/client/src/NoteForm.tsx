import React, { useState } from 'react';

interface NoteFormProps {
  onNoteSubmit: (content: string) => void;
}

class NoteForm extends React.Component<NoteFormProps> {
  state = {
    content: ''
  };

  handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { content } = this.state;
    if (content.trim()) {
      this.props.onNoteSubmit(content);
      this.setState({ content: '' });
    }
  };

  render() {
    const { content } = this.state;
    return (
      <form onSubmit={this.handleSubmit}>
        <input
          type="text"
          value={content}
          onChange={(e) => this.setState({ content: e.target.value })}
          placeholder="Enter a note"
          required
        />
        <button type="submit">Add Note</button>
      </form>
    );
  }
}

export default NoteForm;