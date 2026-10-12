import java.util.*

fun main() {
    val analyzer = TemperatureAnalyzer()
    
    while (true) {
        print("Enter temperature value (or 'done' to finish): ")
        val input = readLine().toString().trim()
        
        if (input.lowercase() == "done") break
        
        try {
            val value = input.toDouble()
            analyzer.addTemperature(value)
        } catch (e: NumberFormatException) {
            println("Invalid temperature value. Please enter a valid number.")
        }
    }
    
    if (analyzer.temperatures.isEmpty()) {
        println("No temperatures were added.")
    } else {
        val meanTemp = analyzer.mean()
        val maxTemp = analyzer.max()
        val minTemp = analyzer.min()
        
        println("\n------ Temperature Report ------")
        println("Mean: $meanTemp")
        println("Max : $maxTemp")
        println("Min : $minTemp")
    }
}

class TemperatureAnalyzer {
    private var temperatures: MutableList<Double> = mutableListOf()

    
}