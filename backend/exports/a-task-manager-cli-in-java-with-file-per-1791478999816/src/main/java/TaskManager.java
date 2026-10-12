package main;

import java.util.Properties;
import java.io.IOException;

public class TaskManager {
    private SimpleFileManager storage;

    public TaskManager() {
        this.storage = new SimpleFileManager();
    }

    public void addTask(String key, String value) throws IOException {
        // Use the save method from SimpleFileManager
        storage.save(key, value);
    }

    public Properties getAllTasks() throws IOException {
        // Get all tasks using loadAll method from SimpleFileManager
        return storage.loadAll();
    }
}