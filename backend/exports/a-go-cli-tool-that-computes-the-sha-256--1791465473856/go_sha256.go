// Go SHA-256 Checksum CLI
// Computes the SHA-256 hash of a file in a Go command-line tool.

package app

import (
	"crypto/sha256"
	"fmt"
	"io/ioutil"
	"os"
)

func checksum(filename string) int {
	data, err := ioutil.ReadFile(filename)
	if err != nil {
		fmt.Printf("Error reading file %s: %v\n", filename, err)
		return 1
	}

	hasher := sha256.New()
	hasher.Write(data)
	checksum := fmt.Sprintf("%x", hasher.Sum(nil))

	fmt.Printf("Checksum for file '%s':\n%s\n", filename, checksum)

	return 0
}

func main() {
	if len(os.Args) != 2 {
		fmt.Println("Usage: go_sha256 <filename>")
		os.Exit(1)
	}

	filename := os.Args[1]

	checksum(filename)
}