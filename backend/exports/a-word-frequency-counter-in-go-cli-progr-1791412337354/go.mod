module wordfreq

require (
    "fmt"
)

package main

import (
    "bufio"
    "fmt"
    "os"
    "strings"
)

func main() {
    scanner := bufio.NewScanner(os.Stdin)
    freq := make(map[string]int)

    for scanner.Scan() {
        words := strings.Fields(scanner.Text())
        for _, word := range words {
            freq[word]++
        }
    }

    if err := scanner.Err(); err != nil {
        fmt.Println("Error reading input:", err)
        return
    }

    for word, count := range freq {
        fmt.Printf("%s: %d\n", word, count)
    }
}