package main

import (
	"crypto/sha256"
	"fmt"
	"os"
)

func main() {
	if len(os.Args) < 2 {
		fmt.Println("Usage: sha256sum <file>")
		os.Exit(1)
	}

	filePath := os.Args[1]
	h, err := calculateSHA256(filePath)
	if err != nil {
		fmt.Printf("Error while processing '%s': %v\n", filePath, err)
		os.Exit(1)
	}
	fmt.Printf("%x  %s\n", h, filePath)
}

func calculateSHA256(filePath string) ([32]byte, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return [32]byte{}, fmt.Errorf("failed to open file: %v", err)
	}
	defer file.Close()

	h := sha256.New()
	buf := make([]byte, 8192)
	for {
		n, err := file.Read(buf)
		if n > 0 {
			h.Write(buf[:n])
		}
		if err != nil {
			return [32]byte{}, fmt.Errorf("unable to read file: %v", err)
		}
	}

	var hash [32]byte
	copy(hash[:], h.Sum(nil))
	return hash, nil
}