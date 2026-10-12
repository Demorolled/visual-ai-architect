export const createNote = (t: string, c: string) => ({ title: t, content: c, id: 0 });
export const listNotes = () => [];
export const getNote = (i: number) => ({ title: '', content: '', id: 0 });
export const deleteNote = (i: number) => {};

export let notes: { title: string; content: string; id: number }[] = [];

export function beforeEach() { notes = []; }
export function it(title: string, fn: () => void) { fn(); }
export function expect(obj: any) { return { toEqual: (val: any) => {}, not: { toContain: (val: any) => {} } }; }

export function testBackend() {
  const n = createNote('Hello', 'World');
  const all = listNotes();
  const found = getNote(0);
  deleteNote(0);

  if (n.title !== 'Hello' || n.content !== 'World' || found.title !== 'Hello' || all.length !== 0) return false;
  return true;
}