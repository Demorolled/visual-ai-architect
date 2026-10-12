import { NotesItem } from './notes';

const fs = require('fs');
const path = require('path');

const NOTES_FILE = path.join(__dirname, '../notes.json');

export function loadNotes(): NotesItem[] {
  if (!fs.existsSync(NOTES_FILE)) return [];
  return JSON.parse(fs.readFileSync(NOTES_FILE, 'utf-8'));
}

export function saveNotes(notes: NotesItem[]): void {
  fs.writeFileSync(NOTES_FILE, JSON.stringify(notes, null, 2));
}