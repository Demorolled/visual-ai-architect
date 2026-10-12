import { createServer } from 'http';
import { parse } from 'url';

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017';

const client = new MongoClient(MONGODB_URI);

async function handleRequest(req, res) {
  const { pathname } = parse(req.url, true);
  const method = req.method || 'GET';

  try {
    if (pathname === '/notes' && method === 'GET') {
      const notes = await getNotes();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(notes));
    } else if (pathname === '/notes' && method === 'POST') {
      const body = await new Promise((resolve, reject) => {
        let data = '';
        req.on('data', chunk => { data += chunk; });
        req.on('end', () => { resolve(data); });
        req.on('error', reject);
      });
      const note = JSON.parse(body);
      await addNote(note);
      res.writeHead(201);
      res.end();
    } else if (pathname === '/notes/:id' && method === 'DELETE') {
      const { id } = parse(req.url, true).query;
      await deleteNote(id);
      res.writeHead(204);
      res.end();
    } else {
      res.writeHead(404);
      res.end();
    }
  } catch (error) {
    console.error('Error handling request:', error);
    res.writeHead(500);
    res.end();
  }
}

async function getNotes() {
  try {
    await client.connect();
    const db = client.db('notes');
    const notes = await db.collection('notes').find({}).toArray();
    return notes;
  } catch (error) {
    throw new Error('Failed to retrieve notes');
  }
}

async function addNote(note) {
  try {
    await client.