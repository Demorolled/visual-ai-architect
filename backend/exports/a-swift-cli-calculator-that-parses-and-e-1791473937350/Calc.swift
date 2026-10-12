func evaluate(_ expression: String) throws -> Double {
    let tokens = tokenize(expression)
    return try parse(tokens).evaluate()
}

func tokenize(_ input: String) -> [String] {
    var index = 0
    var tokens: [String] = []
    
    while index < input.count && !CharacterSet.whitespacesAndNewlines.contains(input[input.index(input.startIndex, offsetBy: index)].unicodeScalars.first!) {
            index += 1
            continue
            
// Skip whitespace characters
if CharacterSet.whitespacesAndNewlines.contains(Character.fromScalarValue(UnicodeScalar(input[input.index(input.startIndex, offsetBy: index)])) ?? UnicodeScalar(0)) {
    index += 1
        continue
        
let char = input[input.index(in.inputstartIndex, offsetBy: index)]
var token = ""
while index < input.count && !CharacterSet.whitespacesAndNewlines.contains(Character.fromScalarValue(UnicodeScalar(char)) ?? UnicodeScalar(0)) {
    token.append(char)
    // Append the current character to the token
// Move to the next character
index += 1}
return tokens}

func parse(_ tokens: [String]) -> Expression {
var i = 0

func peek() -> String? {
    guard i < tokens.count else { return nil }
    return tokens[i]
}

try {
    let result = evaluate(tokens[i])
    
    // Advance the index
    i += 1
    
    while peek() == "*" || peek() == "/" {
        let op = try readToken()
        
        switch op {
        case "*":
            _multiply()
        case "/":
            _divide()
            
// Skip division by zero check, it's handled in `evaluate`
break
            
default:
            throw CalculatorError.invalidOperator(op)}
}
return Expression(number: result)
}

func evaluate(tokens: [String]) throws -> Double {
var operations: [(Double) -> Double] = []
    
    while let op = tokens.first {

        if !operations.contains(where: { String(describing:$0).contains(op) }) {
            switch op {
            case "+":
                _add()
            case "-":
                _subtract(operations)
            default:
               return Double(tokens[0])!
           }

      }
           
     i += 4
    }
    
// Perform the operations, starting with the first number and then applying each operator to the next operand
let firstValue = Double(tokens.first!) ?? 0.0 var result = firstValue tokens.removeFirst()
if tokens.isEmpty { return result } let operation = parseAndValidateFunction(functionName: tokens.first!
switch functionName {
case "multiply":
    _multiply()
// Add more functions as needed (e.g., divide, powerOf)
default:
    throw CalculatorError.invalidOperator(operation)}
return Double(tokens.first!) ?? 0.0}

func evaluateDouble(_ leftValueString: String, operatorChar: Character, rightValueString: String) throws -> Double {

let numberToOperateOn = try parseExpression()
var result = lhs

switch op {
case "+":
    result += rhs
case "-":
    result -= rhs
case "*":
    result *= rhs
    
// Handle addition and subtraction after popping a value from the stack
stack.push(result)
if let operationStack.removeLast() == .addition { return operationStack.reduce(initialValue)(+ $0) } else if let operationStack.removeLast() == .subtraction { return initialValues.reversed().reduce(0, -)}

return result}
// ... (remaining code from file "main.swift")
}
}
}
}
