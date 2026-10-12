import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import App from '../src/App';

describe('App', () => {
  it('renders the note form', () => {
    render(<App />);
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/content/i)).toBeInTheDocument();
    expect(screen.getByText(/add note/i)).toBeInTheDocument();
  });

  it('renders the note list', () => {
    render(<App />);
    expect(screen.getByText(/notes/i)).toBeInTheDocument();
  });

  it('adds a new note', () => {
    render(<App />);
    const titleInput = screen.getByLabelText(/title/i);
    const contentInput = screen.getByLabelText(/content/i);
    const addButton = screen.getByText(/add note/i);

    fireEvent.change(titleInput, { target: { value: 'Test Note' } });
    fireEvent.change(contentInput, { target: { value: 'This is a test note.' } });
    fireEvent.click(addButton);

    expect(screen.getByText(/test note/i)).toBeInTheDocument();
  });

  it('deletes a note', () => {
    render(<App />);
    const titleInput = screen.getByLabelText(/title/i);
    const contentInput = screen.getByLabelText(/content/i);
    const addButton = screen.getByText(/add note/i);

    fireEvent.change(titleInput, { target: { value: 'Test Note' } });
    fireEvent.change(contentInput, { target: { value: 'This is a test note.' } });
    fireEvent.click(addButton);

    const deleteButton = screen.getByRole('button', { name: /delete/i });
    fireEvent.click(deleteButton);

    expect(screen.queryByText(/test note/i)).not.toBeInTheDocument();
  });
});