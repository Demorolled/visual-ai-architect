import { render, screen, fireEvent } from '@testing-library/react';
import { NoteForm } from '../NoteForm.tsx';

describe('NoteForm', () => {
  it('renders correctly', () => {
    render(<NoteForm />);
    expect(screen.getByText('Add Note')).toBeInTheDocument();
  });

  it('submits a note', () => {
    render(<NoteForm />);
    const titleInput = screen.getByLabelText('Title');
    const contentInput = screen.getByLabelText('Content');
    const submitButton = screen.getByText('Add Note');

    fireEvent.change(titleInput, { target: { value: 'Test Title' } });
    fireEvent.change(contentInput, { target: { value: 'Test Content' } });
    fireEvent.click(submitButton);

    expect(screen.getByText('Test Title')).toBeInTheDocument();
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });
});