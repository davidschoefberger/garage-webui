package router

import (
	"context"
	"crypto/subtle"
	"errors"
	"fmt"
	"khairul169/garage-webui/utils"
	"log"
	"net/http"
	"net/url"
	"os"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

// OIDC implements the OpenID Connect authorization code flow (with PKCE) as
// an alternative login method. The web UI has a single admin role, so every
// user the provider authenticates — and who passes the optional group check —
// gets full access. Restrict who may log in at the provider (e.g. Pocket ID's
// "allowed user groups" on the client) and/or via OIDC_ALLOWED_GROUPS.
type OIDC struct {
	mu       sync.Mutex
	provider *oidc.Provider
	verifier *oidc.IDTokenVerifier
	client   *http.Client
}

const (
	sessOIDCState    = "oidc_state"
	sessOIDCNonce    = "oidc_nonce"
	sessOIDCVerifier = "oidc_verifier"
)

func NewOIDC() *OIDC {
	return &OIDC{client: &http.Client{Timeout: 10 * time.Second}}
}

// init lazily runs discovery so the server still starts (and password login
// keeps working) while the identity provider is unreachable. A failed
// discovery is retried on the next login attempt.
func (o *OIDC) init(ctx context.Context) (*oidc.Provider, *oidc.IDTokenVerifier, error) {
	o.mu.Lock()
	defer o.mu.Unlock()

	if o.provider != nil {
		return o.provider, o.verifier, nil
	}

	ctx, cancel := context.WithTimeout(oidc.ClientContext(ctx, o.client), 10*time.Second)
	defer cancel()

	provider, err := oidc.NewProvider(ctx, os.Getenv("OIDC_ISSUER_URL"))
	if err != nil {
		return nil, nil, err
	}

	o.provider = provider
	o.verifier = provider.Verifier(&oidc.Config{ClientID: os.Getenv("OIDC_CLIENT_ID")})
	return o.provider, o.verifier, nil
}

func (o *OIDC) oauthConfig(r *http.Request, p *oidc.Provider) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     os.Getenv("OIDC_CLIENT_ID"),
		ClientSecret: utils.GetSecret("OIDC_CLIENT_SECRET"),
		Endpoint:     p.Endpoint(),
		RedirectURL:  oidcRedirectURL(r),
		Scopes:       oidcScopes(),
	}
}

func (o *OIDC) Login(w http.ResponseWriter, r *http.Request) {
	if !utils.OIDCEnabled() {
		http.NotFound(w, r)
		return
	}

	p, _, err := o.init(r.Context())
	if err != nil {
		log.Printf("OIDC discovery failed: %v", err)
		oidcFail(w, r, "Identity provider is unreachable")
		return
	}

	state := oauth2.GenerateVerifier()
	nonce := oauth2.GenerateVerifier()
	verifier := oauth2.GenerateVerifier()

	utils.Session.Set(r, sessOIDCState, state)
	utils.Session.Set(r, sessOIDCNonce, nonce)
	utils.Session.Set(r, sessOIDCVerifier, verifier)

	authURL := o.oauthConfig(r, p).AuthCodeURL(state,
		oidc.Nonce(nonce),
		oauth2.S256ChallengeOption(verifier),
	)
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (o *OIDC) Callback(w http.ResponseWriter, r *http.Request) {
	if !utils.OIDCEnabled() {
		http.NotFound(w, r)
		return
	}

	// One-shot values: remove them whatever the outcome.
	state, _ := utils.Session.Pop(r, sessOIDCState).(string)
	nonce, _ := utils.Session.Pop(r, sessOIDCNonce).(string)
	verifier, _ := utils.Session.Pop(r, sessOIDCVerifier).(string)

	q := r.URL.Query()
	if e := q.Get("error"); e != "" {
		log.Printf("OIDC provider returned error: %s: %s", e, q.Get("error_description"))
		oidcFail(w, r, "Login was rejected by the identity provider")
		return
	}

	if state == "" {
		// Typically SESSION_COOKIE_SAMESITE=strict (the cookie isn't sent on the
		// cross-site redirect back from the provider) or a server restart.
		log.Printf("OIDC callback without login state in session (SameSite=strict cookie or expired session?)")
		oidcFail(w, r, "Login session expired, please try again")
		return
	}
	if subtle.ConstantTimeCompare([]byte(state), []byte(q.Get("state"))) != 1 {
		oidcFail(w, r, "Invalid login state, please try again")
		return
	}

	p, idVerifier, err := o.init(r.Context())
	if err != nil {
		log.Printf("OIDC discovery failed: %v", err)
		oidcFail(w, r, "Identity provider is unreachable")
		return
	}

	ctx, cancel := context.WithTimeout(oidc.ClientContext(r.Context(), o.client), 15*time.Second)
	defer cancel()

	token, err := o.oauthConfig(r, p).Exchange(ctx, q.Get("code"), oauth2.VerifierOption(verifier))
	if err != nil {
		log.Printf("OIDC code exchange failed: %v", err)
		oidcFail(w, r, "Login failed")
		return
	}

	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok {
		log.Printf("OIDC token response contains no id_token")
		oidcFail(w, r, "Login failed")
		return
	}

	idToken, err := idVerifier.Verify(ctx, rawIDToken)
	if err != nil {
		log.Printf("OIDC id_token verification failed: %v", err)
		oidcFail(w, r, "Login failed")
		return
	}
	if subtle.ConstantTimeCompare([]byte(idToken.Nonce), []byte(nonce)) != 1 {
		log.Printf("OIDC id_token nonce mismatch")
		oidcFail(w, r, "Login failed")
		return
	}

	var claims map[string]interface{}
	if err := idToken.Claims(&claims); err != nil {
		log.Printf("OIDC cannot decode claims: %v", err)
		oidcFail(w, r, "Login failed")
		return
	}

	user := oidcUserName(claims, idToken.Subject)
	if err := checkOIDCGroups(claims); err != nil {
		log.Printf("OIDC login denied for %s: %v", user, err)
		oidcFail(w, r, "You are not allowed to access this application")
		return
	}

	if err := utils.Session.RenewToken(r); err != nil {
		log.Printf("cannot renew session token: %v", err)
		oidcFail(w, r, "Login failed")
		return
	}
	// Single-user UI: every OIDC identity maps to the admin session.
	utils.Session.Set(r, "authenticated", true)
	utils.Session.Set(r, "user", user)
	log.Printf("OIDC login: %s", user)

	http.Redirect(w, r, os.Getenv("BASE_PATH")+"/", http.StatusFound)
}

// oidcFail sends the browser back to the login page with a message to show.
func oidcFail(w http.ResponseWriter, r *http.Request, msg string) {
	target := os.Getenv("BASE_PATH") + "/auth/login?error=" + url.QueryEscape(msg)
	http.Redirect(w, r, target, http.StatusFound)
}

// oidcRedirectURL returns OIDC_REDIRECT_URL, or derives the callback URL from
// the request (honouring X-Forwarded-Proto/Host from a reverse proxy).
func oidcRedirectURL(r *http.Request) string {
	if v := os.Getenv("OIDC_REDIRECT_URL"); v != "" {
		return v
	}

	scheme := "http"
	if r.TLS != nil {
		scheme = "https"
	}
	if v := firstHeaderValue(r, "X-Forwarded-Proto"); v != "" {
		scheme = v
	}
	host := r.Host
	if v := firstHeaderValue(r, "X-Forwarded-Host"); v != "" {
		host = v
	}

	return fmt.Sprintf("%s://%s%s/api/auth/oidc/callback", scheme, host, os.Getenv("BASE_PATH"))
}

func firstHeaderValue(r *http.Request, key string) string {
	v, _, _ := strings.Cut(r.Header.Get(key), ",")
	return strings.TrimSpace(v)
}

func splitList(s string) []string {
	return strings.FieldsFunc(s, func(r rune) bool {
		return r == ',' || r == ' '
	})
}

func oidcGroupsClaim() string {
	return utils.GetEnv("OIDC_GROUPS_CLAIM", "groups")
}

func oidcScopes() []string {
	scopes := splitList(utils.GetEnv("OIDC_SCOPES", "openid profile email"))
	if !slices.Contains(scopes, oidc.ScopeOpenID) {
		scopes = append([]string{oidc.ScopeOpenID}, scopes...)
	}
	// Pocket ID (and most providers) only include the groups claim when the
	// "groups" scope is requested.
	if os.Getenv("OIDC_ALLOWED_GROUPS") != "" && oidcGroupsClaim() == "groups" && !slices.Contains(scopes, "groups") {
		scopes = append(scopes, "groups")
	}
	return scopes
}

func oidcUserName(claims map[string]interface{}, sub string) string {
	for _, key := range []string{"preferred_username", "email", "name"} {
		if v, ok := claims[key].(string); ok && v != "" {
			return v
		}
	}
	return sub
}

// checkOIDCGroups enforces OIDC_ALLOWED_GROUPS (if set): the user must be a
// member of at least one of the listed groups.
func checkOIDCGroups(claims map[string]interface{}) error {
	allowed := splitList(os.Getenv("OIDC_ALLOWED_GROUPS"))
	if len(allowed) == 0 {
		return nil
	}

	var groups []string
	switch v := claims[oidcGroupsClaim()].(type) {
	case string:
		groups = []string{v}
	case []interface{}:
		for _, g := range v {
			if s, ok := g.(string); ok {
				groups = append(groups, s)
			}
		}
	}

	for _, g := range groups {
		if slices.Contains(allowed, g) {
			return nil
		}
	}
	return errors.New("not a member of any group in OIDC_ALLOWED_GROUPS (groups claim: " + strings.Join(groups, ",") + ")")
}
