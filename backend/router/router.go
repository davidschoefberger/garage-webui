package router

import (
	"khairul169/garage-webui/middleware"
	"net/http"
)

func HandleApiRouter() *http.ServeMux {
	mux := http.NewServeMux()

	auth := &Auth{}
	mux.HandleFunc("POST /auth/login", auth.Login)

	router := http.NewServeMux()
	router.HandleFunc("POST /auth/logout", auth.Logout)
	router.HandleFunc("GET /auth/status", auth.GetStatus)

	config := &Config{}
	router.HandleFunc("GET /config", config.GetAll)

	update := &Update{}
	router.HandleFunc("GET /update/check", update.Check)

	buckets := &Buckets{}
	router.HandleFunc("GET /buckets", buckets.GetAll)

	lifecycle := &Lifecycle{}
	router.HandleFunc("GET /buckets/{bucket}/lifecycle", lifecycle.Get)
	router.HandleFunc("PUT /buckets/{bucket}/lifecycle", lifecycle.Set)

	cors := &Cors{}
	router.HandleFunc("GET /buckets/{bucket}/cors", cors.Get)
	router.HandleFunc("PUT /buckets/{bucket}/cors", cors.Set)

	browse := &Browse{}
	router.HandleFunc("GET /browse/{bucket}", browse.GetObjects)
	router.HandleFunc("POST /browse/{bucket}/invalidate-cache", browse.InvalidateCache)
	router.HandleFunc("POST /browse/{bucket}/rename", browse.RenameObject)
	router.HandleFunc("GET /browse/{bucket}/{key...}", browse.GetOneObject)
	router.HandleFunc("PUT /browse/{bucket}/{key...}", browse.PutObject)
	router.HandleFunc("DELETE /browse/{bucket}/{key...}", browse.DeleteObject)

	// Proxy request to garage api endpoint
	router.HandleFunc("/", ProxyHandler)

	mux.Handle("/", middleware.AuthMiddleware(router))
	return mux
}
