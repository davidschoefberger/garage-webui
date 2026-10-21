package utils

import "os"

// PasswordAuthEnabled reports whether username/password login is configured.
func PasswordAuthEnabled() bool {
	return GetSecret("AUTH_USER_PASS") != ""
}

// OIDCEnabled reports whether OpenID Connect login is configured.
func OIDCEnabled() bool {
	return os.Getenv("OIDC_ISSUER_URL") != "" && os.Getenv("OIDC_CLIENT_ID") != ""
}

// AuthEnabled reports whether any login method is configured. When false, the
// UI is served without authentication.
func AuthEnabled() bool {
	return PasswordAuthEnabled() || OIDCEnabled()
}
