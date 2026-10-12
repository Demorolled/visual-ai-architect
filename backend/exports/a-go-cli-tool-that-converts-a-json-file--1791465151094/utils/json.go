package utils

import (
	"encoding/json"
	"gopkg.in/yaml.v3"
)

type JsonToYamlHandler struct{}

func (*JsonToYamlHandler) Handle(input string) (output string, err error) {
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(input), &data); err != nil {
		return "", err
	}
	yamlData, err := yaml.Marshal(data)
	if err != nil {
		return "", err
	}

	return string(yamlData), nil
}