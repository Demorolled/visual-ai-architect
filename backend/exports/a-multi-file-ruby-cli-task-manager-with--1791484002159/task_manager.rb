require_relative './tasks_file'

def help_message
  puts 'Usage: task_MANAGER'
  puts 'Options:'
  puts ' list - View all tasks'
  puts ' add <description> <priority(hi, lo)> - Add a new task'
end

if __FILE__ == $0 && ARGV.empty?
  puts "Error:"
  help_message
else
def run(args = [])
    if args.first == 'list'
        tasks=TasksFile.read_from_json(args[1])
        if task.nil? || !tasks.is_a?(Array)
          puts "Task '#{args[1]}' not found!"
          return
        end

      tasks.each_with_index do |task, index|
         puts "[#{index + 1}] Description: #{task.description}, Priority: #{task.priority}"
      end
    elsif args.first == 'add'
        if args.length < 4
            puts "Usage: task_manager add [description] [priority]"
          return
        end

      description = args[1]
      priority = args[2].downcase
         valid_priorities=['hi','lo']
         unless valid_priorities.include?(priority)
           puts 'Invalid priority, please provide one of {hi|lo}'
           next
         end
           
        new_task={
          description: desciption,
          completed=false,
          priority=priority.to_sym
        }
      
      TaskManager.add(description,priority)
    else 
          help_message  
     end
end