class TaskManagerError < StandardError; end

require_relative '../db/tasks_database'

def add_task(task_name)
  TasksDatabase.add({ name: task_name })
end

def list_tasks(filter_completed = true)
  tasks = TasksDatabase.list.filter { |task| filter_completed || !task[:completed] }
  
  puts "Current List of #{tasks.size} Task(s):"
  
  if tasks.empty?
    puts '(none)'
    return
  end
  
  tasks.each_with_index do |task, index|
    status_symbol = task[:completed] ? '✓' : '-'
    color_prefix = task[:completed] ? "#{status_symbol} ✅".green : "#{status_symbol} ···".light_black
    
    puts "[#{index + 1}] #{color_prefix.ljust(5)} #{task[:name]}"
  end
end

def complete_task(task_index)
  TasksDatabase.complete(task_index)
end