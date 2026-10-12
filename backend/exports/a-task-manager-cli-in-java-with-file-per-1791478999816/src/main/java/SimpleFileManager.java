package main;

import java.util.Properties;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Paths;

public class SimpleFileManager {

    private static final String TASKS_FILE = "tasks.properties";

    public void saveTaskToFile(String taskId, String taskLine) {
        try (OutputStream out = Files.newOutputStream(Paths.get(TASKS_FILE))) {
            Properties prop = new Properties();
            if (!Files.exists(Paths.get(TASKS_FILE)) || !isTaskPresent(taskId)) {
                prop.setProperty(taskId, taskLine);
                prop.store(out, "");
                System.out.println("Task saved with ID: " + taskId);
            } else {
                System.out.println("A task already exists with this ID.");
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private boolean isTaskPresent(String taskId) throws Exception {
        return loadTasksFromFile().containsKey(taskId);
    }

    public Properties loadTasksFromFile() {
        try (InputStream in = Files.newInputStream(Paths.get(TASKS_FILE))) {
            Properties prop = new Properties();
            if (Files.exists(Paths.get(TASKS_FILE))) {
                prop.load(in);
                System.out.println("Tasks loaded from " + TASKS_FILE);
                return prop;
            }
        } catch (Exception e) { e.printStackTrace(); }
        System.out.println("No tasks file found.");
        return new Properties();
    }
}