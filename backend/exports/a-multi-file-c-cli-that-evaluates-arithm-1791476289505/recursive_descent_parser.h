#ifndef RECURSIVE_DESCENT_PARSER_H
#define RECURSIVE_DESCENT_PARSER_H

#include <iostream>
#include <vector>
#include <string>
#include <sstream>

using namespace std;

class RecursiveDescentParser {
private:
    istringstream input;
    size_t pos = 0;
    string currentToken;

    bool skipWhitespace();
    void nextToken();

public:
    RecursiveDescentParser(const string& expr);
    double parseExpression();
};

#endif // RECURSIVE_DESCENT_PARSER_H