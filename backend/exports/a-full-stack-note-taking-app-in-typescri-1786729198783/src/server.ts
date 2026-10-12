export const startServer = async () => {
    const express = require('express');
    const cors = require('cors');
    const { createNote, listNotes, getNote, deleteNote } = require('./backend');
    const { saveNote, loadNotes } = require('./database');

    const app = express();
    app.use(express.json());
    app.use(cors());

    app.post('/notes', (req, res) => { createNote(req.body, saveNote); res.status(201).send({ message: 'Note created' }); });
    app.get('/notes', (req, res) => { listNotes(loadNotes(), res); });
    app.get('/notes/:id', (req, res) => { getNote(req.params.id, loadNotes(), res); });
    app.delete('/notes/:id', (req, res) => { deleteNote(req.params.id, loadNotes(), saveNote); res.status(204).send(); });

    const server = await new Promise((resolve) => {
        const server = app.listen(3000, () => {
            resolve(server);
        });
    });

    console.log('Server running on http://localhost:3000');
};