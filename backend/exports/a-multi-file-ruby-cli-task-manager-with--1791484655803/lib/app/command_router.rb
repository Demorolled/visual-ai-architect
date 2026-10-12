require_relative '../tasks/task_store'

module TaskManager
  def self.run(command)
    store = TaskStore.new('todo.json')
    case command['action']
    when 'add'
      description = command['description']
      if TaskValidator.validate(description).ok?
        id = store.add_task(TaskIdGenerator.generate, description)
        puts "Added task (ID=#{id})"
        id
      else
        puts 'Failed to add task; please enter a valid description.'
        nil
      end
    when 'list'
      tasks = store.get_all_tasks
      if tasks.each { |task| puts "[#{task.completed? ? '[x]' : '[ ]']} #{task.id}: #{task.description}"}
        puts 'No active tasks to display'
      else
        puts 'All tasks are done; the list is empty.'
      end
    when 'complete'
      id = command['id']
      task = store.find_task(id)
      if task and not task.completed?
        done = store.complete_task(id)
        puts "Task #{done ? '[✓]' : 'failed'} (ID=#{task.id})"
        done
      else
        puts "No such active task: #{id}"
        nil
      end
    when 'help'
      puts '-- HELP --\nadd DESCRIPTION\nlist\complete ID\help'
    else
      puts 'Unknown command; enter help for the list of available actions.'
    end
  end
end

if __FILE__ == $0
  TaskManager.run(ActionParser.parse)
end