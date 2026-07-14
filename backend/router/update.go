package router

import (
	"encoding/json"
	"fmt"
	"io"
	"khairul169/garage-webui/utils"
	"net/http"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// Update exposes a lightweight version checker that compares the running
// versions of garage-webui and Garage against their latest upstream tags.
// It only reports whether a newer version exists — it never applies updates.
type Update struct{}

type componentUpdate struct {
	Current         string `json:"current"`
	Latest          string `json:"latest"`
	UpdateAvailable bool   `json:"updateAvailable"`
	URL             string `json:"url"`
}

type updateResult struct {
	Webui  componentUpdate `json:"webui"`
	Garage componentUpdate `json:"garage"`
}

var semverRe = regexp.MustCompile(`^v?(\d+)\.(\d+)\.(\d+)`)

func parseSemver(s string) ([3]int, bool) {
	m := semverRe.FindStringSubmatch(strings.TrimSpace(s))
	if m == nil {
		return [3]int{}, false
	}
	var v [3]int
	for i := 0; i < 3; i++ {
		n, _ := strconv.Atoi(m[i+1])
		v[i] = n
	}
	return v, true
}

func semverLess(a, b [3]int) bool {
	for i := 0; i < 3; i++ {
		if a[i] != b[i] {
			return a[i] < b[i]
		}
	}
	return false
}

func isNewer(current, latest string) bool {
	cv, ok1 := parseSemver(current)
	lv, ok2 := parseSemver(latest)
	if !ok1 || !ok2 {
		return false
	}
	return semverLess(cv, lv)
}

// latestGitHubTag returns the highest stable (non-prerelease) semver tag of a
// GitHub repository, cached for 6 hours.
func latestGitHubTag(repo string) (string, error) {
	cacheKey := "latesttag:" + repo
	if c := utils.Cache.Get(cacheKey); c != nil {
		return c.(string), nil
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/tags?per_page=100", repo)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "garage-webui")

	client := &http.Client{Timeout: 10 * time.Second}
	res, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return "", fmt.Errorf("github tags for %s: status %d", repo, res.StatusCode)
	}

	body, err := io.ReadAll(res.Body)
	if err != nil {
		return "", err
	}
	var tags []struct {
		Name string `json:"name"`
	}
	if err := json.Unmarshal(body, &tags); err != nil {
		return "", err
	}

	best := ""
	var bestV [3]int
	for _, t := range tags {
		if strings.Contains(t.Name, "-") {
			continue // skip prereleases like v1.0.0-rc1
		}
		v, ok := parseSemver(t.Name)
		if !ok {
			continue
		}
		if best == "" || semverLess(bestV, v) {
			best, bestV = t.Name, v
		}
	}
	if best == "" {
		return "", fmt.Errorf("no stable tag found for %s", repo)
	}

	utils.Cache.Set(cacheKey, best, 6*time.Hour)
	return best, nil
}

func currentGarageVersion() string {
	body, err := utils.Garage.Fetch("/v2/GetNodeInfo?node=self", &utils.FetchOptions{})
	if err != nil {
		return ""
	}
	var data struct {
		Success map[string]struct {
			GarageVersion string `json:"garageVersion"`
		} `json:"success"`
	}
	if json.Unmarshal(body, &data) != nil {
		return ""
	}
	for _, n := range data.Success {
		if n.GarageVersion != "" {
			return n.GarageVersion
		}
	}
	return ""
}

func (u *Update) Check(w http.ResponseWriter, r *http.Request) {
	res := updateResult{}

	// Opt-out for air-gapped deployments.
	if strings.EqualFold(os.Getenv("UPDATE_CHECK_DISABLED"), "true") {
		utils.ResponseSuccess(w, res)
		return
	}

	// garage-webui — current version is provided by the frontend.
	webuiRepo := utils.GetEnv("UPDATE_WEBUI_REPO", "davidschoefberger/garage-webui")
	res.Webui.Current = r.URL.Query().Get("webui")
	if latest, err := latestGitHubTag(webuiRepo); err == nil {
		res.Webui.Latest = latest
		res.Webui.URL = fmt.Sprintf("https://github.com/%s/releases/tag/%s", webuiRepo, latest)
		res.Webui.UpdateAvailable = isNewer(res.Webui.Current, latest)
	}

	// Garage — the latest tag is read from the GitHub mirror (stable JSON API),
	// but the link points at the canonical Gitea tag page.
	garageRepo := utils.GetEnv("UPDATE_GARAGE_REPO", "deuxfleurs-org/garage")
	res.Garage.Current = currentGarageVersion()
	if latest, err := latestGitHubTag(garageRepo); err == nil {
		res.Garage.Latest = latest
		res.Garage.URL = fmt.Sprintf("https://git.deuxfleurs.fr/Deuxfleurs/garage/src/tag/%s", latest)
		res.Garage.UpdateAvailable = isNewer(res.Garage.Current, latest)
	}

	utils.ResponseSuccess(w, res)
}
