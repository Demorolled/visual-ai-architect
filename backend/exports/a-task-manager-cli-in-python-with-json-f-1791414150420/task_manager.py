import json

def add_task(tasks, task_name):
    tasks.append({'name': task_name})
    return f'Task "{task_name}" added.'

def list_tasks(tasks):
    if not tasks:
        return 'No tasks found.'
    result = []
    for i, task in enumerate(tasks):
        status_char = 'x' if ('status' in task and task['status'] == True) else '-'
        result.append(f'{i + 1}. {task["name"]}{" [done]" if ("status" in task and task["status"] == True) else ""}')
    return '\n'.join(result)

def done_task(tasks, task_index):
    try:
        tasks[task_index]['status'] = True
        return f'Task "{tasks[task_index]["name"]}" marked as done.'
    except IndexError:
        return 'Task not found.'

def remove_task(tasks, task_name):
    for i, task in enumerate(tasks):
        if task['name'] == task_name:
            del tasks[i]
            return f'Task removed: {task_name}'
    return f'Task "{"{task_name}"}" does not exist.'
if __name__ == '__main__':
    import argparse
    import os

class TaskManagerStore:
    def __init__(self, file_path):
        self.file_path = file_path

    def load(self):
        if os.path.exists(self.file_path):
            with open(self.file_path, 'r') as f:
                try:
                    tasks = json.load(f)
                    return tasks
                except ValueError:  # Invalid JSON format (empty or malformed string)
                    return []
        else:
            return []

    def save(self, tasks):
        with open(self.file_path + '.tmp', 'w') as tmp_file_tmp:
            tmp_file_tmp.write(json.dumps(tasks))
        os.replace(self.file_path + '.tmp', self.file_path)

if __name__ == '__main__':
    description = "a task manager CLI in python with JSON file persistence and add/list/done/remove commands"
    argument_parser_arg_list_8j71yq = argparse.ArgumentParser(description=description)
    argument_parser_arg_list_8j71yq.add_argument('--task-manager-add', metavar='NME', choices=['add','list','done','remove'], help='input description')
    input_output_file_value_from_command_line = '/data/storage.json'
    store_instance_variable_of_type_TaskManagerStore_in_module_task_manager_at_address_is_assigned_to_a_store_instance_variable_with_the_given_file_path
task_list = []
if __name__ == '__main__':
    commands_from_command_line_argument_parser_arg_list_8j71yq = argument_parser_arg_list_8j71yq.parse_args()
if not input_output_file_value_from_command_line:
    print('Error: Please provide a file path for the task manager store.')
    exit(1)
file_path = input_output_file_value_from_command_line
print(f'Task Manager is running with tasks persistently stored in "{file_path}"')
task_list.extend(store_instance_variable_of_type_TaskManagerStore_in_module_task_manager_at_address_is_assigned_to_a_store_instance_variable_with_the_given_file_path.load())
if __name__ == '__main__':
    cmd = commands_from_command_line_argument_parser_arg_list_8j71yq.task_manager_add
    print(cmd)
    if cmd not in ['add','list','done','remove']:
        print("invalid task name: please choose from 'all', 'daily', 'weekly'.")
        sys.exit()
if __name__ == '__main__':
    match commands_from_command_line_argument_parser_arg_list_8j71yq.task_manager_add:
        case "add":
            run_task(tasks, int(commands_from_command_line_argument_parser_arg_list_8j70u4k))
        case other:
            print("invalid task name: please choose from 'all', 'daily', 'weekly'.")
print('Done.')