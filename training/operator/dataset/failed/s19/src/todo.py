import json
import os
from dataclasses import asdict, dataclass, field
from datetime import datetime

@dataclass
class TodoItem:
    description: str
    completed: bool = False
    created_at: datetime = field(default_factory=datetime.now)

def _load() -> list[TodoItem]:
    try:
        with open('todos.json', 'r') as f:
            return [TodoItem(**item) for item in json.load(f)]
    except FileNotFoundError:
        return []

def _save(items: list[TodoItem]):
    with open('todos.json', 'w') as f:
        json.dump([asdict(i) for i in items], f, indent=2)

def add_task(description: str) -> TodoItem:
    item = TodoItem(description=description)
    items = _load()
    items.append(item)
    _save(items)
    return item

def list_tasks() -> list[TodoItem]:
    return _load()

def mark_complete(item_id: int) -> bool:
    items = _load()
    for i, item in enumerate(items):
        if item.id == item_id:
            items[i].completed = True
            _save(items)
            return True
    return False