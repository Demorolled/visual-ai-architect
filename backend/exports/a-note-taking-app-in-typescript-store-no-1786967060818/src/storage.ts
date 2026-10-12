export interface NoteItem {
  id: number;
  title: string;
  content: string;
}

export async function loadNotes(): Promise<NoteItem[]> {
  try {
    const data = await Deno.readTextFile('notes.json');
    return JSON.parse(data);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return [];
    }
    throw new Error(`Failed to load notes: ${err.message}`);
  }
}

export async function saveNotes(notes: NoteItem[]): Promise<void> {
  try {
    await Deno.writeTextFile('notes.json', JSON.stringify(notes, null, 2));
  } catch (err) {
    throw new Error(`Failed to save notes: ${err.message}`);
  }
}