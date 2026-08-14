export function addTodo(task) {
  const list = document.getElementById('todo-list');
  const item = document.createElement('li');
  item.textContent = task;
  item.addEventListener('click', () => item.remove());
  list.appendChild(item);
}

export function loadTodos() {
  const list = document.getElementById('todo-list');
  list.innerHTML = '';
}