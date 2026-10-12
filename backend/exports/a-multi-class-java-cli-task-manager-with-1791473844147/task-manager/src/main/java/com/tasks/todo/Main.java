import java.util.ArrayList;
import java.util.Scanner;

public class Main {
    private static final String TODO_FILE = "todos.txt";

    public static void main(String[] args) {
        Scanner scanner = new Scanner(System.in);
        ArrayList<String> tasks = new ArrayList<>();

        System.out.println("Task Manager started.");
       int choice;
            try {
                choice = scanner.nextInt();
                scanner.nextLine(); // Consume the newline character
            } catch (Exception e) {
                printlnLine("Invalid input! Please enter a number.");
            }

            switch ((int)choice) {
}
}
}
