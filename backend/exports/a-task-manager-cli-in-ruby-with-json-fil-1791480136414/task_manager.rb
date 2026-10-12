require 'json'

module TasksManager
    def self.create(task_data)
        new_task = Task.new(id: SecureRandom.uuid,
                           description: task_data[:description],
                           deadline: Time.parse(task_data[:deadline]),
                           priority: tasks_list.find(:highest_priority) || :low,
                           status: false)
                # TODO add validations (e.g. non-empty desc, deadline format check)
        @tasks << new_task
        write_json!
    end

    def self.check_task(id); ...; end  # return task JSON or raise exception if not found
end