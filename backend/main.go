package main

import (
	"flag"
	"fmt"
	"khairul169/garage-webui/router"
	"khairul169/garage-webui/ui"
	"khairul169/garage-webui/utils"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/joho/godotenv"
)

// runHealthcheck performs a self HTTP GET against the running server and exits
// with a non-zero status on failure. This lets the container HEALTHCHECK work
// without shipping curl in the scratch image (issue #48).
func runHealthcheck() {
	port := utils.GetEnv("PORT", "3909")
	basePath := os.Getenv("BASE_PATH")
	url := fmt.Sprintf("http://127.0.0.1:%s%s/", port, basePath)

	client := &http.Client{Timeout: 3 * time.Second}
	res, err := client.Get(url)
	if err != nil {
		log.Printf("healthcheck failed: %v", err)
		os.Exit(1)
	}
	defer res.Body.Close()
	if res.StatusCode >= 400 {
		log.Printf("healthcheck failed: status %d", res.StatusCode)
		os.Exit(1)
	}
}

func main() {
	healthcheck := flag.Bool("healthcheck", false, "run an HTTP healthcheck against the server and exit")
	flag.Parse()
	if *healthcheck {
		runHealthcheck()
		return
	}

	// Initialize app
	godotenv.Load()

	// Ensure the temp dir exists so large multipart uploads don't fail on
	// minimal (scratch) images that ship without /tmp (issue #44).
	if err := os.MkdirAll(os.TempDir(), 0o1777); err != nil {
		log.Printf("cannot create temp dir %q: %v", os.TempDir(), err)
	}

	utils.InitCacheManager()
	sessionMgr := utils.InitSessionManager()

	if err := utils.Garage.LoadConfig(); err != nil {
		log.Println("Cannot load garage config!", err)
	}

	basePath := os.Getenv("BASE_PATH")
	mux := http.NewServeMux()

	// Serve API
	apiPrefix := basePath + "/api"
	mux.Handle(apiPrefix+"/", http.StripPrefix(apiPrefix, router.HandleApiRouter()))

	// Static files
	ui.ServeUI(mux)

	// Redirect to UI if BASE_PATH is set
	if basePath != "" {
		mux.Handle("/", http.RedirectHandler(basePath, http.StatusMovedPermanently))
	}

	host := utils.GetEnv("HOST", "0.0.0.0")
	port := utils.GetEnv("PORT", "3909")

	addr := fmt.Sprintf("%s:%s", host, port)
	log.Printf("Starting server on http://%s", addr)

	if err := http.ListenAndServe(addr, sessionMgr.LoadAndSave(mux)); err != nil {
		log.Fatal(err)
	}
}
