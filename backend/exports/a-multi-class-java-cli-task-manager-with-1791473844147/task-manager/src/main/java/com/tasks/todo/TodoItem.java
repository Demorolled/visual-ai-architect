package com.tasks.todo;

public class TodoItem {
    private String description;
    private boolean isCompleted;

    public static final int UNASSIGNED = -1;
    private int weight; // You can add additional fields or logic as needed

    // Constructor to initialize a new task with default values
    public void setState() { 
        this.isCompleted = false;
        this.weight = 0; 
    } 

    // Public setter method for description
    public void setDescription(String desc) {
		this.description = desc;
	}

	public String getDescription() {
		return description + " completed:" + isCompleted + " weight: " + weight ;
	}
    
// Other constructors and methods for Task can be added as needed

// String representation of the task
@Override
public String toString() {
    return (isCompleted ? "[✓]" : "[✗]") +" "+ this.description; //+  getPriority();
}

}