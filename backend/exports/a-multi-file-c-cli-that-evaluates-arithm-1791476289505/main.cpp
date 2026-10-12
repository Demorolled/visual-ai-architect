#include <iostream>
#include <string>

int main(int argc, char** argv) {
    if (argc != 2 || std::isspace(argv[1][0])) {
        std::cout << "Usage: ./expression_evaluator \"<arithmetic_expression>\"" << std::endl;
        return EXIT_FAILURE;
    }
    
    try {
		const char* expr = argv[1];
	    // TODO use the parser to evaluate
		std::size_t i=0;
		int result = calculate(i);
		if (expr[i]=='\0'){
		    std::cout<<"The expression evaluates to: "<<result<<std::endl;

        }
  } catch(...) {
    std::cout << "Invalid arithmetic expression" << std::endl; return EXIT_FAILURE;
}
return EXIT_SUCCESS;
}