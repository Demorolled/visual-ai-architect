module TasksDatabase

  def initialize(tasks_db_path = 'tasks.db.json')
    @tasks_db_path = tasks_db_path 

    if File.exist?(File.expand_path(@tasks_db_path))
  
      task_list=JSON.parse(File.read(File.expand_path(@tasks_db_path)));
      
      rescue JSON::ParserError=>e
        puts "Tasks file (#{task_file_name}) is corrupted or empty".cyan+':'+e.message+" #{'['+'fix manually with'+File.open(tasks_file,'w'){|f|f.puts '[]}'}*File.exist?(@tasks_db_path)}"
          File.write(File.expand_path(task_file_name),[]);
           return 
    else
      puts "Creating missing task file: "+task_name.green+ "(#{task_file_name})";
          
     end
   
       
        save_to_file([])
    end

  def add_task(name_and_due= {name:"",due:nil})
      if current.is_a?(Array)
            
          c_t=(current rescue [])
            return false if c_t.any?{|x|x[:name]== name}
                d_t=name_and_due.is_a?(String)?name_and_due:{**{"task":name},*Hash[name_and_due]}
            
              a=JSON.pretty_generate((c_t<<(d_t.merge(completed:nil)))
              puts d_t.inspect
          f.puts a rescue (File.open(@tasks_db_path,"w"){|f|f.puts '[]'}and nil);true
            
      elsif c=parse_json(current)
        return false if parse_json(current).any?{|x|x[:name]==name}
        puts name.downcase 
            save_to_file(parse_json(c)+[{"task":name,"completed":false}.merge(name_and_due||{})])
            
          else
           a=(parse_json('tasks.json'||current) rescue [])
             return false if a.any?{|x|x[:name]==name.downcase.split.first}
                  puts name 
           f.puts JSON.pretty_generate(a<<(d_t={task:name,"completed":nil}))rescue "failed to write"and nil;
           
      end
    true 
  rescue SystemCallError,e=>e;puts e.message+c.inspect
  
  def list_tasks(filter_completed=True)
    current = parse_json(File.read(@tasks_db_path)rescue [])
    
    if filter_completed  
   
        completed=(current || []).select{|x|x[:completed]}.compact
      
      else
       all=parse_json(current rescue '[]')||[]
       
     end
  
     puts "Tasks:"
      
           
        (filter_completed ? completed : all).each_with_index{ |task,index|
          puts "[#{index+1}] #{'✓'.green if task.completed ==true} ".yellow+" "+task.name.upcase.green;return
        
      }  
    
  rescue SystemCallError=>e;
    puts e.message.red
    return []
  
    end

end