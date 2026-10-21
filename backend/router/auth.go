package router

import (
	"encoding/json"
	"errors"
	"khairul169/garage-webui/utils"
	"net/http"
	"strings"

	"golang.org/x/crypto/bcrypt"
)

type Auth struct{}

func (c *Auth) Login(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.ResponseError(w, err)
		return
	}

	userPass := strings.SplitN(utils.GetSecret("AUTH_USER_PASS"), ":", 2)
	if len(userPass) < 2 {
		utils.ResponseErrorStatus(w, errors.New("password login is not enabled"), http.StatusBadRequest)
		return
	}

	if strings.TrimSpace(body.Username) != userPass[0] || bcrypt.CompareHashAndPassword([]byte(userPass[1]), []byte(body.Password)) != nil {
		utils.ResponseErrorStatus(w, errors.New("invalid username or password"), 401)
		return
	}

	if err := utils.Session.RenewToken(r); err != nil {
		utils.ResponseError(w, err)
		return
	}
	utils.Session.Set(r, "authenticated", true)
	utils.Session.Set(r, "user", userPass[0])
	utils.ResponseSuccess(w, map[string]bool{
		"authenticated": true,
	})
}

func (c *Auth) Logout(w http.ResponseWriter, r *http.Request) {
	utils.Session.Clear(r)
	utils.ResponseSuccess(w, true)
}

func (c *Auth) GetStatus(w http.ResponseWriter, r *http.Request) {
	enabled := utils.AuthEnabled()
	authSession, _ := utils.Session.Get(r, "authenticated").(bool)

	res := map[string]interface{}{
		"enabled":       enabled,
		"authenticated": !enabled || authSession,
		"methods": map[string]interface{}{
			"password": utils.PasswordAuthEnabled(),
			"oidc":     utils.OIDCEnabled(),
		},
	}
	if utils.OIDCEnabled() {
		res["oidcName"] = utils.GetEnv("OIDC_PROVIDER_NAME", "SSO")
	}
	if user, ok := utils.Session.Get(r, "user").(string); ok && authSession {
		res["user"] = user
	}

	utils.ResponseSuccess(w, res)
}
