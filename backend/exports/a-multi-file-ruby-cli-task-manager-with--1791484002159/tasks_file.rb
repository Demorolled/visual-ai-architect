# Task entity persistence and I/O methods for CRUD operations

require 'json'

class TasksFile
  def initialize(filename)
    @filename = filename
  end

  # Writes tasks array to a JSON file
  def write_to_json(tasks)
    File.open(@filename, 'w') do |f|
      f.write(tasks.to_json)
    end
  rescue StandardError => e
    puts "Failed to write tasks: '#{e.message}'"
  end

  # Reads tasks array from a JSON file and returns it. Returns an empty array if the file doesn't exist or is invalid.
  def read_from_json
    if File.exist?(@filename)
      begin
        data = File.read(@filename)
        tasks = JSON.parse(data)
      rescue StandardError => e
        puts "Failed to parse json: '#{e.message}'"
        return []
      end

      # Validate each task in the array is a hash with 'id' and 'description'
      return tasks if tasks.is_a?(Array) && tasks.all? { |t| t.is_a?(Hash) && t.key?('id') && t.key?('description') }

      puts "Invalid format"
    else
    end

    []
  rescue StandardError => e
    puts "Failed to read: '#{e.message}'" if e.message.present?
    # Return an empty array instead of raising an exception for invalid JSON.
    return []
  end
end