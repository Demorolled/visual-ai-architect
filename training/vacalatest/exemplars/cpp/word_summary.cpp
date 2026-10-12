#include <iostream>
#include <sstream>
#include <string>
#include <unordered_set>
#include <vector>

int main() {
    std::ostringstream buffer;
    buffer << std::cin.rdbuf();

    std::istringstream input(buffer.str());
    std::string word;
    std::vector<std::string> words;
    std::unordered_set<std::string> distinct;

    while (input >> word) {
        words.push_back(word);
        distinct.insert(word);
    }

    std::cout << "words=" << words.size() << " distinct=" << distinct.size()
              << std::endl;
    return 0;
}
