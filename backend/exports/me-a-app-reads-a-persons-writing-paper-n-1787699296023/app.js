document.addEventListener('DOMContentLoaded', () => {
  const editor = document.getElementById('editor');
  const preview = document.getElementById('preview');
  const saveButton = document.getElementById('saveButton');
  const loadButton = document.getElementById('loadButton');

  let savedContent = '';

  const updatePreview = () => {
    const content = editor.value;
    preview.innerHTML = DOMPurify.sanitize(marked.parse(content));
  };

  editor.addEventListener('input', updatePreview);
  updatePreview();

  saveButton.addEventListener('click', () => {
    savedContent = editor.value;
    alert('Content saved!');
  });

  loadButton.addEventListener('click', () => {
    if (savedContent) {
      editor.value = savedContent;
      updatePreview();
      alert('Content loaded!');
    } else {
      alert('No saved content.');
    }
  });
});