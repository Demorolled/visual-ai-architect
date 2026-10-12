import kotlin.test.*
import java.io.File

class CharacterFrequencyTest {
    private fun countFrequencies(contents: String): Map<Char, Int> {
        val frequencies = mutableMapOfChar, Int>()
        contents.forEach { char ->
            if (char.isLetter()) {
                frequencies[char] = frequencies.getOrDefault(char, 0) + 1
            }
        }
        return frequencies.filterKeys { it.isLetter() }.toSortedMap()
    }

    @Test fun testCountFrequencies() {
        val input = "Hello, World!"
        val expectedOutput: MutableMap<Char, Int> = mutableMapOf(Char to Int)
        for (char in file.readText()) {
            if ((char.isLetterOrDigit() || !char.isWhitespace()) && char.toString().length == 1) {
                expectedOutput[char.lowercaseChar()] = expectedOutput.getOrDefault(char.lowercaseChar(), 0) + 1
            }
        }

        val result = countFrequencies(input)
        assertEquals(expectedOutput, result)
    }
}