const todoList = JSON.parse(localStorage.getItem('todoList') || '[]');
function save() {
  localStorage.setItem('todoList', JSON.stringify(todoList));
}
function display() {
  console.log('ID ┊ Status ┊ Description');
  todoList.forEach((item, i) => console.log(`${i + 1} ┊ ${item.done ? 'Done' : 'Todo'} ┊ ${item.desc}`));
}
function addDesc(desc) { todoList.push({ done: false, desc }); save(); console.log('Added task:', desc);
}
function deleteId(id) {
  const i = id - 1;
  if (i < 0 || i >= todoList.length) {
    console.error(`Error: No task with id ${id}`);
    return;
  }
  todoList.splice(i, 1); save(); console.log('Deleted task', id);
}
function toggleId(id) {
  const i = id - 1;
  if (i < 0 || i >= todoList.length) {
    console.error(`Error: No task with id ${id}`);
    return;
  }
  todoList[i].done = !todoList[i].done; save(); console.log('Toggled status of task', id);
}
function main() {

// Deterministic fix: the entry defines main() but never invokes it.
main();
