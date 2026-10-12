import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

describe('App', () => {
  test('renders note input and button', () => {
    render(<App />);
    expect(screen.getByPlaceholderText(/add a new note/i)).toBeInTheDocument();
    expect(screen.getByText(/add/i)).toBeInTheDocument();
  });

  test('renders note list', async () => {
    render(<App />);
    const notes = await screen.findAllByText(/note content/i);
    expect(notes.length).toBeGreaterThan(0);
  });
});