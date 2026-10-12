import Foundation

class WordFrequencyCounter {
    func countWords(in filePath: String) -> [String: Int] {
        let fileContents = try! String(contentsOfFile: filePath)
        let words = fileContents.split(separator: " ").map { String($0.lowercased()) }
                .filter { !$0.isEmpty && $0.allSatisfy(Character.isLetterOrNumber) }
        var frequencyMap = [String: Int]()

        for word in words {
            frequencyMap[word, default: 0] += 1
        }

        return frequencyMap
    }
}

if CommandLine.arguments.count < 2 {
    print("Usage: \(CommandLine.arguments[0]) <input.txt>")
} else {
    let filePath = String(CommandLine.arguments.dropFirst().first!)
    let counter = WordFrequencyCounter()
    let frequencies = counter.countWords(in: filePath)
    
    for (word, count) in frequencies.sorted(by: { $0.value > $1.value }) {
        print("\(count): \(word)")
    }
}