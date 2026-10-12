
import App from '../../client/src/App.tsx';

test('renders note taking app', () => {
  render(<App />);
  const heading = screen.getByText(/note taking app/i);
  expect(heading).toBeInTheDocument();
});

test('adds a new note', () => {
  render(<App />);
  const titleInput = screen.getByLabelText(/title/i);
  const contentInput = screen.getByLabelText(/content/i);
  const addButton = screen.getByText(/add note/i);

  fireEvent.change(titleInput, { target: { value: 'Test Note' } });
  fireEvent.change(contentInput, { target: { value: 'This is a test note.' } });
  fireEvent.click(addButton);

  const noteElement = screen.getByText(/test note/i);
  expect(noteElement).toBeInTheDocument();
});

test('deletes a note', () => {
  render(<App />);
  const titleInput = screen.getByLabelText(/title/i);
  const contentInput = screen.getByLabelText(/content/i);
  const addButton = screen.getByText(/add note/i);

  fireEvent.change(titleInput, { target: { value: 'Test Note' } });
  fireEvent.change(contentInput, { target: { value: 'This is a test note.' } });
  fireEvent.click(addButton);

  const deleteButton = screen.getByText(/delete/i);
  fireEvent.click(deleteButton);

  const noteElement = screen.queryByText(/test note/i);
  expect(noteElement).not.toBeInTheDocument();
});