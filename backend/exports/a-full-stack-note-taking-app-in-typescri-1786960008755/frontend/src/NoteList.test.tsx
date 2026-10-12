import React from 'react';
import { render, screen } from '@testing-library/react';
import NoteList from './NoteList';

export function testNoteList() {
  render(<NoteList notes={[]} onDelete={() => {}} />);
  expect(screen.getByText(/no notes/i)).toBeInTheDocument();
}