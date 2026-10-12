import axios from 'axios';

const apiUrl = 'http://localhost:3000';

interface Note {
  id: number;
  content: string;
}

export const createNote = async (note: Note) => {
  try {
    const response = await axios.post(`${apiUrl}/notes`, note);
    return response.data;
  } catch (error) {
    throw new Error('Failed to create note');
  }
};

export const getNotes = async () => {
  try {
    const response = await axios.get(`${apiUrl}/notes`);
    return response.data;
  } catch (error) {
    throw new Error('Failed to fetch notes');
  }
};