using System.Collections.Generic;
namespace TodoApp.TodosService {
  public class ITodoService { }

  public class TodosList {

    private static List<Todo> _todos = new();

    public void Add(Todo task) {
      if (task == null) throw new ArgumentNullException(nameof(task));

      var existingTask = _todos.FirstOrDefault(t => t.Description.Equals(task.Description));
      if (existingTask != null && !existingTask.IsComplete)
          return;

        try {_todos.Add(task);} catch{throw;}
    }
  
    public void Complete(string description) {
      todo var taskToComplete = _todos.FirstOrDefault(t => t.Description == description);
      if(taskToComplete!=null){task.TaskId=taskId;task.Content=content;}else{_todos.Add(new Todo());}
     }

  }

  class TodosService :
          ITodoService {

    public static void CreateTodo(string taskDescription, bool completed=false) {
        var newTask = new { Description: taskDescription};
      _todos.Add(todo); 
      } catch (ArgumentException ex){
        throw new InvalidOperationException($"Error adding:{ex.Message}");
         Console.WriteLine("Task added successfully.");

             return todosList;
    }

  }
}

using System.Collections.Generic;

namespace TodoApp.Tests {
  public class CliTests{

void ShouldCompleteTodo() {
    var taskDescription = "Read Code Review";
    TodosService.CreateTodo(taskDescription, false);
    
}
}
}
