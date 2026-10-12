import Foundation

// Swift exemplar: top-level statements in main.swift (so no @main here), no
// .characters, no SPM dependencies.
var text = ""
while let line = readLine() {
    text += line + "\n"
}

let words = text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
let distinct = Set(words)

print("words=\(words.count) distinct=\(distinct.count)")
