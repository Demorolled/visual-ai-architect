let args = CommandLine.arguments.dropFirst()

guard !args.isEmpty else {
    print("Usage: swift calc.swift <expression>")
    exit(1)
}

func isOperator(_ ch: Character) -> Bool {
    return "+-*/".contains(ch)
}
// ... (remaining code from Calc.swift)

do {
    let expression = args.first!
    let result = try evaluate(expression)
    print(result)
} catch {
    print("Error \(error)")
}