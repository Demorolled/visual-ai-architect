import json
import os
from typing import List

import todo

def run() -> None:
    todos: List[todo.TodoItem] = todo.load_tasks()

    todos.append(todo.TodoItem(id=0, title='buy milk', completed=False))
    todos.append(todo.TodoItem(id=1, title='write report', completed=False))

    todo.save_tasks(todos)

    print('---')
    for t in todos:
        if t.completed:
            print('[x]', t.title)
        else:
            print('[ ]', t.title)

if __name__ == '__main__':
    run()