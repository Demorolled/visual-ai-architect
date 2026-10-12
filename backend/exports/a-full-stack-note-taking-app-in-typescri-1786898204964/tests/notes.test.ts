const fetch = require('node-fetch');

describe('Notes API', () => {
  const apiUrl = 'http://localhost:3000/notes';

  it('should get an empty list of notes initially', async () => {
    const response = await fetch(apiUrl);
    expect(response.status).toBe(200);
    const notes = await response.json();
    expect(notes).toEqual([]);
  });

  it('should create a new note', async () => {
    const newNote = { title: 'Test Note', content: 'This is a test note.' };
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newNote),
    });
    expect(response.status).toBe(201);
    const createdNote = await response.json();
    expect(createdNote).toHaveProperty('id');
    expect(createdNote.title).toBe(newNote.title);
    expect(createdNote.content).toBe(newNote.content);
  });

  it('should get the list of notes after creation', async () => {
    const response = await fetch(apiUrl);
    expect(response.status).toBe(200);
    const notes = await response.json();
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe('Test Note');
    expect(notes[0].content).toBe('This is a test note.');
  });

  it('should update a note', async () => {
    const newNote = { title: 'Test Note', content: 'This is a test note.' };
    const createResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newNote),
    });
    const createdNote = await createResponse.json();
    const noteId = createdNote.id;

    const updatedNote = { title: 'Updated Note', content: 'This is an updated note.' };
    const updateResponse = await fetch(`${apiUrl}/${noteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedNote),
    });
    expect(updateResponse.status).toBe(200);

    const getResponse = await fetch(apiUrl);
    expect(getResponse.status).toBe(200);
    const notes = await getResponse.json();
    expect(notes.length).toBe(1);
    expect(notes[0].title).toBe(updatedNote.title);
    expect(notes[0].content).toBe(updatedNote.content);
  });

  it('should delete a note', async () => {
    const newNote = { title: 'Test Note', content: 'This is a test note.' };
    const createResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newNote),
    });
    const createdNote = await createResponse.json();
    const noteId = createdNote.id;

    const deleteResponse = await fetch(`${apiUrl}/${noteId}`, {
      method: 'DELETE',
    });
    expect(deleteResponse.status).toBe(204);

    const getResponse = await fetch(apiUrl);
    expect(getResponse.status).toBe(200);
    const notes = await getResponse.json();
    expect(notes.length).toBe(0);
  });
});