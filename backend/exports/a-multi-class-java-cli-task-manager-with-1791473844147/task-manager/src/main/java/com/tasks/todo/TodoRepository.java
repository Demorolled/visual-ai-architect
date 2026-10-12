package com.tasks.todo;

import java.util.List;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.io.File;
import java.io.IOException;

public class TodoRepository {
    private String filePath;

    public TodoRepository(String filePath) {
        this.filePath = filePath;
    }

    // Load items from the file into a list and return it.
    public List<TodoItem> load() throws IOException {
        try (var reader = Files.newBufferedReader(Paths.get(filePath))) {
            List<String> lines = new ArrayList<>();
            String line;
            while ((line = reader.readLine()) != null) {
                lines.add(line);
            }
            // Parse the lines into TodoItem objects and return as a list.
           
        } catch (Exception ex) {}
        throw ex; 
    }

    public void save(List<TodoItem> todos) { // This method is correct, but there is an unused variable 'outStream' in
   try {
       File file = new File(filePath); 
       for (TodoItem item : todos) {
           // Write each todo item to the output stream.
         
// Error handling for save operation.
    }
} catch (Exception e) {}
}
}