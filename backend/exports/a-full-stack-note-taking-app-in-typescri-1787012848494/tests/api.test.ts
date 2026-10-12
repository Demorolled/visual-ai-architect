import { app } from '../src/api.ts';

const request = async (method: 'GET' | 'POST', url: string, body?: { title: string; content: string }) => {
  return new Promise((resolve, reject) => {
    const req = new XMLHttpRequest();
    req.open(method, `http://localhost:3000${url}`);
    if (method === 'POST') {
      req.setRequestHeader('Content-Type', 'application/json');
    }
    req.onload = () => {
      if (req.status < 200 || req.status >= 300) {
        reject(new Error(`Request failed with status ${req.status}`));
      }
      try {
        resolve(JSON.parse(req.responseText));
      } catch (e) {
        reject(new Error(`Invalid JSON response: ${req.responseText}`));
      }
    };
    req.onerror = () => reject(new Error('Network error'));
    req.send(body ? JSON.stringify(body) : null);
  });
};

describe('API tests', () => {
  it('should return a list of notes', async () => {
    const notes = await request('GET', '/notes');
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBe(0);
  });

  it('should add a new note', async () => {
    const note = { title: 'Test note', content: 'This is a test note' };
    const res = await request('POST', '/notes', note);
    expect(res).toEqual({ message: 'Note added successfully' });
  });

  it('should return the updated list of notes', async () => {
    const notes = await request('GET', '/notes');
    expect(Array.isArray(notes)).toBe(true);
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe('Test note');
    expect(notes[0].content).toBe('This is a test note');
  });
});