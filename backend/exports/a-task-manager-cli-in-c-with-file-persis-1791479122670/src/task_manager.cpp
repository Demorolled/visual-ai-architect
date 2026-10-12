// Task Manager CLI in C++ with File Persistence
#include <iostream>
#include <fstream>
#include <sstream>
#include <vector>
#include <string>
#include <cstring>

struct Task {
	std::string description;
	bool done = false;
};
std::vector<Task> tasks;

void parse_input(int argc, char* argv[], std::vector<std::pair<std::string, std::string>>& parsed_args) {
	for (int i = 1; i < argc; ++i) {
		if (!strncmp(argv[i], "--", 2)) {
			parsed_args.push_back({argv[i] + 2, argv[++i]});
		}
	}
}

bool save_to_file() {
	std::ofstream ofs("tasks.txt");
	if (!ofs) return false;
	for (const auto& t : tasks) {
		ofs << (t.done ? "done" : "pending") << "|" << t.description << "\n";
	}
	return true;
}

void load_from_file() {
	tasks.clear();
	std::ifstream ifs("tasks.txt");
	if (!ifs) return;
	std::string line;
	while (std::getline(ifs, line)) {
		size_t pos = line.find('|');
		if (pos != std::string::npos) {
			bool done = (line.substr(0, pos) == "done");
			tasks.push_back({line.substr(pos + 1), done});
		}
	}
}

void add_task(const std::string& description) {
	Task t;
	t.description = description;
	tasks.push_back(t);
	if (!save_to_file()) {
		std::cout << "Failed to save task." << std::endl;
	} else {
		std::cout << "Task added: '" << description << "'" << std::endl;
	}
}

void list_tasks() {
	load_from_file();
	for (const auto& t : tasks) {
		std::cout << "[" << (t.done ? "x" : " ") << "] " << t.description << std::endl;
	}
	if (tasks.empty()) {
		std::cout << "No tasks found." << std::endl;
	}
}

void done_task(int index) {
	if (index < 1 || index > static_cast<int>(tasks.size())) {
		std::cout << "Invalid task number." << std::endl;
		return;
	}
	tasks[index - 1].done = true;
	if (!save_to_file()) {
		std::cout << "Failed to mark task as done." << std::endl;
	} else {
		std::cout << "Task marked done: '" << tasks[index - 1].description << "'" << std::endl;
	}
}

void remove_task(int index) {
	if (index < 1 || index > static_cast<int>(tasks.size())) {
		std::cout << "Invalid task number." << std::endl;
		return;
	}
	tasks.erase(tasks.begin() + index - 1);
	if (!save_to_file()) {
		std::cout << "Failed to remove task." << std::endl;
	} else {
		std::cout << "Task removed: '" << tasks[index - 1].description << "'" << std::endl;
	}
}

int main(int argc, char** argv) {
	if (argc < 2) {
		std::cout << "Usage: task_manager [add|list|done|remove] [arguments...]" << std::endl;
		return 1;
	}

	std::string command = argv[1];
	if (command == "add" && argc >= 3) {
		add_task(argv[2]);
	} else if (command == "list") {
		list_tasks();
	} else if (command == "done" && argc == 3) {
		try {
			int index = std::stoi(argv[2]);
				done_task(index);
			}
			catch (const std::invalid_argument& e) {
    			std::cout << "Invalid argument: '" << argv[2] << "' is not a valid number." << std::endl;
 			}
	} else if (command == "remove" && argc >= 3) {
		remove_task(std::stoi(argv[2]));
	} else {
      std::cout << "Usage: task_manager [add|list|done|remove] [arguments...]" << std::endl;
      return 1;
    }

	return 0;
}