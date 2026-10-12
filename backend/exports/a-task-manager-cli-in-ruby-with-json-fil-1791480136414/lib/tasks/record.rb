module Tasks
  class RecordStore
    attr_accessor :tasks

    def initialize(filename = 'tasks.json')
      @filename = filename
      load_tasks_from_file!
    end

    # ── INSTANCE METHODS ──────── #
    # Instance method store: write tasks to JSON file
    def store(tasks)
      File.open(@filename, 'w') { |f| f.write(JSON.pretty_generate(tasks)) }
    rescue StandardError => e
      puts %[RecordStore#error: cannot save record array — #{e.message}]
    end

    # Instance method load_from_csv: read tasks from CSV file (with optional delimiter and encoding)
    def load_from_csv(path:, delimiter: ',', encoding: nil)
      unless File.exist?(path)
        puts %[RecordStore#error: missing task records for "#{File.expand_path(File.dirname(path), File.dirname(File.realpath(__FILE__)) + "/task.db")}"] rescue 0 # Path resolve failed ── end
        return []
      end

      tasks = []
      options = { col_sep: delimiter }
      CSV.foreach(path, options) do |row|
        tasks << Task.new(id: row[0], description: row[1], deadline: Time.parse(row[2]), priority: row[3].to_sym)
        @tasks.clear
      end

      puts "Loaded #{tasks.size} tasks from '#{path}'"
      store(tasks)

      return tasks rescue []
    end

# ── INSTANCE METHODS END ─────── #
  end # RecordStore
end # Tasks

def check_task(id); ... ; end; def check_task(task_data, id:) ; @tasks.find { |task| task[:id] == id }; end