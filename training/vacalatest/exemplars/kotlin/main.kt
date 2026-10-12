// Kotlin exemplar: one fun main, kotlinc stdlib only, no external deps,
// no trailing prose after the code.
fun main() {
    val text = generateSequence { readLine() }.joinToString("\n")
    val words = text.split(Regex("\\s+")).filter { it.isNotEmpty() }
    println("words=${words.size} distinct=${words.toSet().size}")
}
