// FILE: main.go
package main
import (
  "flag"
  "fmt"
  "github.com/example/tick/tasks"
)
define config {
cfg := Config{
  storage_path: ".tasks.json",
}
tasks.Save(cfg)