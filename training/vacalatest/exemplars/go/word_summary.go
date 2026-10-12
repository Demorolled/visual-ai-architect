package main

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// The entry file is the only file allowed to declare package main, and it uses
// nothing outside the standard library.
func main() {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)

	var words []string
	for scanner.Scan() {
		words = append(words, strings.Fields(scanner.Text())...)
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintln(os.Stderr, "read error:", err)
		os.Exit(1)
	}

	seen := make(map[string]struct{}, len(words))
	for _, w := range words {
		seen[w] = struct{}{}
	}

	fmt.Printf("words=%d distinct=%d\n", len(words), len(seen))
}
