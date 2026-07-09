package utils

import (
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/alexedwards/scs/v2"
)

type SessionManager struct {
	mgr *scs.SessionManager
}

var Session *SessionManager

func InitSessionManager() *scs.SessionManager {
	sessMgr := scs.New()
	sessMgr.Lifetime = 24 * time.Hour

	// Default Secure=false so the session cookie is still stored when the UI is
	// served over plain HTTP behind a TLS-terminating load balancer / reverse
	// proxy (issue #56). Set SESSION_COOKIE_SECURE=true when serving directly
	// over HTTPS.
	sessMgr.Cookie.Secure = strings.EqualFold(os.Getenv("SESSION_COOKIE_SECURE"), "true")

	switch strings.ToLower(os.Getenv("SESSION_COOKIE_SAMESITE")) {
	case "strict":
		sessMgr.Cookie.SameSite = http.SameSiteStrictMode
	case "none":
		sessMgr.Cookie.SameSite = http.SameSiteNoneMode
	default:
		sessMgr.Cookie.SameSite = http.SameSiteLaxMode
	}

	Session = &SessionManager{mgr: sessMgr}
	return sessMgr
}

func (s *SessionManager) Get(r *http.Request, key string) interface{} {
	return s.mgr.Get(r.Context(), key)
}

func (s *SessionManager) Set(r *http.Request, key string, value interface{}) {
	s.mgr.Put(r.Context(), key, value)
}

func (s *SessionManager) Clear(r *http.Request) error {
	return s.mgr.Clear(r.Context())
}
