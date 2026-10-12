import axios from 'axios';

const apiUrl = '/api/notes';

type Note = {
  id: string;
  content: string;
};

export const fetchNotes = async (): Promise<Note[]> => {
  const response = await axios.get(apiUrl);
  return response.data;
};

export const addNote = async (content: string): Promise<Note[]> => {
  const response = await axios.post(apiUrl, { content });
  return response.data;
};

export const updateNote = async (id: string, content: string): Promise<Note[]> => {
  const response = await axios.put(`${apiUrl}/${id}`, { content });
  return response.data;
};

export const deleteNote = async (id: string): Promise<Note[]> => {
  const response = await axios.delete(`${apiUrl}/${id}`);
  return response.data;
};