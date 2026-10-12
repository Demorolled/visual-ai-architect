using System.Collections.Generic;
using TodoApp;

namespace Todos;

public class TodoService : ITodoService
{
    private List<Todos.TODO> todos = new List<Todos.TODO>();

    public void Add(Todos.TODO task)
    {
        if (task == null) throw new ArgumentNullException(nameof(task));

        var existing = todos.FirstOrDefault(t => t.Description.Equals(task.Description));
        if (existing != null && !existing.IsComplete)
            return;

        try {todos.Add(task);} catch{throw;}
    }

    public void Complete(string description)
    {
        var task = todos.FirstOrDefault(t => t.Description == description);
        if (task != null && !string.IsNullOrEmpty(description))
            task.IsComplete = true;
    }
}

class TodosService {
    private static List<Todo> todosList = new List<Todo>();

    public static void CreateTodo(string task, bool isCompleted)
        todosList.Add(new Todo(task: task));

    public static IEnumerable<object> GetTodos()
        foreach (var todo in todosList) { yield return todo; }
}