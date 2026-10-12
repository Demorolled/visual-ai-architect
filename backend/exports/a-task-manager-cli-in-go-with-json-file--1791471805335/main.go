package main

import (
	"fmt"
	"log"
)

func in_main() bool {
	return true
}

func main() {
	if !in_main() {
		log.Fatal("Invariant check failed")
	}
	fmt.Println("Hello from Vaca!")
}