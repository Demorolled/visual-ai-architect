import { createNote, getNotes } from '../client/src/services/noteApi';
import axios from 'axios';

type Note = {
  id: string;
  content: string;
};

jest.mock('axios');

const mockNote: Note = { id: '1', content: 'Test note' };

beforeEach(() => {
  (axios.get as jest.Mock).mockResolvedValue({ data: [mockNote] });
  (axios.post as jest.Mock).mockResolvedValue({ data: mockNote });
});

test('createNote calls API with note', async () => {
  await createNote(mockNote);
  expect(axios.post).toHaveBeenCalledWith('http://localhost:3000/notes', mockNote);
});

test('getNotes fetches notes from API', async () => {
  const notes = await getNotes();
  expect(notes).toEqual([mockNote]);
});