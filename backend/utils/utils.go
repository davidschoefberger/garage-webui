package utils

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"strings"
)

func GetEnv(key, defaultValue string) string {
	value := os.Getenv(key)
	if len(value) == 0 {
		return defaultValue
	}
	return value
}

// GetSecret returns the value of an env var, but first checks for a companion
// "<KEY>_FILE" variable pointing to a file (e.g. a Docker/Kubernetes secret)
// whose trimmed contents take precedence.
func GetSecret(key string) string {
	if path := os.Getenv(key + "_FILE"); len(path) > 0 {
		data, err := os.ReadFile(path)
		if err != nil {
			log.Printf("cannot read %s_FILE %q: %v", key, path, err)
		} else if v := strings.TrimSpace(string(data)); len(v) > 0 {
			return v
		}
	}
	return os.Getenv(key)
}

func LastString(str []string) string {
	return str[len(str)-1]
}

func ResponseError(w http.ResponseWriter, err error) {
	w.WriteHeader(http.StatusInternalServerError)
	w.Write([]byte(err.Error()))
}

func ResponseErrorStatus(w http.ResponseWriter, err error, status int) {
	w.WriteHeader(status)
	w.Write([]byte(err.Error()))
}

func ResponseSuccess(w http.ResponseWriter, data interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(data)
}
