using System.IO;

public class Todos
{
    private string inputFile = "tasks.json";

    public void Add(string taskDescription)
    {
        var tasks = LoadTasks();
        int id = 1;
        if (tasks.Length > 0) { id = (tasks[tasks.Length - 1].Id + 1); }
        
        TaskItem newItem = new TaskItem(id, false, DateTime.UtcNow);
        List<TaskItem> updatedTasksList = new List<TaskItem>(tasks);
        updatedTasksList.Add(newItem);

        SaveTask(updatedTasksList.ToArray());
    }

    public void List()
    {
        var tasks = LoadTasks();
        if(tasks.Length == 0){
            Console.WriteLine("No items found.");
            return;
        }
        
        foreach(TaskItem item in tasks)
        {
            string status = (item.Done ? "✓" : "✖");
            string createdStr = item.Created.ToString("yyyy-MM-dd HH:mm:ss");
            Console.WriteLine($"[{status}] #{item.Id} {taskDescription}\n Created: {createdStr}");
        }         
    }

    private TaskItem[] LoadTasks()
    {
        try 
        {
            var jsonData = File.ReadAllText(inputFile);
            return Newtonsoft.Json.JsonConvert.DeserializeObject<TaskItem[]>(jsonData) ?? Array.Empty<TaskItem>();
        }
        catch (FileNotFoundException)
        {
            return new TaskItem[0];
        }
    }

    private void SaveTask(TaskItem[] tasks)
    {
        string json = Newtonsoft.Json.JsonConvert.SerializeObject(tasks, Formatting.Indented);
        File.WriteAllText(inputFile, json);     
    }  
}