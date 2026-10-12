import Foundation

// Word frequency counter logic goes here

func readInput(filename: String) throws -> String {
    let url = URL(fileURLWithPath: filename);
    print("url.path: \(url.path)")
    return try String(contentsOf: url)
}

func countWords(input: String) -> [String: Int] {
    var wordCount = [String: Int]()
    
    // Split the input into lines
    let words = input.split(separator: CharacterSet.whitespacesAndNewlines).compactMap { String($0.lowercased()) }
    
    for word in words {
        if let count = wordCount[word, default: 0] {
            wordCount[word]! += 1 // Use `wordCount[word]?` and unwrap it safely
        } else {
            wordCount[word] = 1
        }
        print("\(word): \(wordCount[word] ?? 0)")
    }
    
    return wordCount
}

// Entry point
let filename = CommandLine.arguments.first ?? "input.txt"
do {
    let input = try readInput(filename: filename)
    var results = countWords(input: input)
    for (word, count) in results.sorted(by: { $0.value > $1.value }) {
        print("\(String(repeating: "- ", count: word.count + 3))")
        print(word)
    }
} catch {
    
    // Catch and print the error description
    let errorDescription = "\(error)".split(separator: CharacterSet.whitespacesAndNewlines).compactMap { String($0.description) }

    // Print all words with their counts, formatted as "word\n- "
    for word in errorDescription {
        let countValue = 0
        print(word)
        print(String(repeating: "- ", count: (countValue * 3)))
    }
    
    exit(1)
}