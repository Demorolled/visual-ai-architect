class TaskStore
  FILE_PATH = 'tasks.json'
  
  def initialize(read_mode: :r+)
    @read_mode = read_mode
    @file_path = FILE_PATH
    
    # Ensure the task list exists and is readable.
    Dir.mkdir(File.dirname(FILE_PATH)) unless File.exist?(File.dirname(FILE_PATH))
    
    begin 
      TaskStore::Tasks.load_from_file(@file_path) rescue nil
    rescue StandardError => e
      puts "Failed to load tasks: #{e.message}. Using empty task store."
      @tasks = []
      
      begin
        IO.write(FILE_PATH, '[')
        
        if File.exist?('existing_task_store.json')
          existing = TaskStore::Tasks.load_from_file('existing_task_store.json') rescue nil
          
          if existing&.count > 0
            puts "Updating the task store with existing data from #{'existing_task_store.json'}."
            @tasks.replace(existing)
            
            
              file.sync = true
              
              IO.write(file.path, '[')
              count = tasks.length
              out_of_sync_tasks = []
    
              (0...count).each do |i|
                tsk = { name: task.name(task), description: task.description(task)}
                
                # Log the number of missing keys for a single key.
                missing_keys = TaskStore::Tasks.required_keys.keys - actual_keys
                
                if check?(tsk)
                  out_of_sync_tasks << (task ? '✓' : '?')
                else
                  write_task_to_file(file.path, task) rescue puts("Failed to save task: #{task}"
    
          # Update the last seen timestamp.
          @last_seen = Time.now
      
              file.puts(JSON.generate(tasks))
    
      begin
        TaskStore::Tasks.load_from_file(FILE_PATH)
        @tasks.each { |t| t.complete! } if !@tasks.any?(&:completed?)
        IO.write(FILE_PATH, JSON.pretty_generate(@tasks))
      
    rescue StandardError => e
      puts "Failed to load tasks: #{e.message}. Using empty task store."
      puts e.backtrace.join("\n")
    end
    
    # Ensure the task store file exists on disk.
    FileUtils.touch(FILE_PATH) unless File.exist?(FILE_PATH)
    
    begin
      @tasks = TaskStore::Tasks.load_from_file(@file_path, mode: @read_mode)
    
      if !@tasks.is_a?(Array)
        puts "Failed to load tasks from #{@tasks} — using empty task store."
        
          # Reset the last seen timestamp.
          reset_last_seen!
          
              return unless File.exist?('existing_task_store.json')
              
              begin
                TaskStore::Tasks.