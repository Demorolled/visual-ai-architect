import { startServer } from '../src/api';
import App from '../src/frontend/App';

function testAddNote() {
  const { getByText } = render(<App />);
  const button = getByText('Add Note');
  button.click();
  expect(getByText('Note added')).toBeInTheDocument();
}

function testDeleteNote() {
  const { getByText, getAllByText } = render(<App />);
  const button = getAllByText('Delete')[0];
  button.click();
  expect(getByText('Note deleted')).toBeInTheDocument();
}

startServer();
testAddNote();
testDeleteNote();