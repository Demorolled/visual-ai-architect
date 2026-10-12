import { render } from '@testing-library/react';
import NotesList from '../NotesList';

test('renders the list of notes', () => {
  const notes = [
    { id: '1', title: 'Note 1', content: 'Content 1' },
    { id: '2', title: 'Note 2', content: 'Content 2' }
  ];

  const { getByText } = render(<NotesList notes={notes} />);

  notes.forEach(note => {
    expect(getByText(note.title)).toBeInTheDocument();
    expect(getByText(note.content)).toBeInTheDocument();
  });
});