import { startAPI } from "./api";
const startFrontend = async () => {
    const [noteService] = await startAPI();
    const notes = await noteService.getAllNotes();
    const notesElement = document.createElement("div");
    notesElement.style.margin = "20px";
    notes.forEach(note => {
        const noteElement = document.createElement("div");
        noteElement.textContent = `${note.id}: ${note.content}`;
        noteElement.style.margin = "10px";
        notesElement.appendChild(noteElement);
    });
    document.body.appendChild(notesElement);
    const form = document.createElement("form");
    form.style.margin = "20px";
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "New note";
    form.appendChild(input);
    const submitButton = document.createElement("button");
    submitButton.textContent = "Add";
    submitButton.onclick = async () => {
        const noteContent = input.value.trim();
        if (noteContent.length === 0) return;
        await noteService.createNote(noteContent);
        input.value = "";
        const notes = await noteService.getAllNotes();
        notesElement.innerHTML = "";
        notes.forEach(note => {
            const noteElement = document.createElement("div");
            noteElement.textContent = `${note.id}: ${note.content}`;
            noteElement.style.margin = "10px";
            notesElement.appendChild(noteElement);
        });
    };
    form.appendChild(submitButton);
    document.body.appendChild(form);
};