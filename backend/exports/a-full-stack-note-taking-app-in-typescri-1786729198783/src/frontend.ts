export const renderNotes = (notes: Note[]) => {
  const container = document.createElement('div');
  for (const { id, title, content, tags } of notes) {
    const div = document.createElement('div');
    div.className = 'note-card';
    div.innerHTML = `
      <div class="note-title">${escapeHTML(title)}</div>
      <div class="note-content">${escapeHTML(content)}</div>
      <div class="note-tags">${tags.map(t => `<span class="note-tag-${t}">${escapeHTML(t)}</span>`).join('')}</div>
      <button class="note-edit" onclick="editNote(${id})">Edit</button>
      <button class="note-delete" onclick="deleteNote(${id})">Delete</button>
    `;
    container.appendChild(div);
  }
  return container;
};

const escapeHTML = (s: string) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');